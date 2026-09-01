import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, 
  onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
  getFirestore, collection, addDoc, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, 
  onSnapshot, query, where, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBf5mCIwJppnrIMXtOuplARaO9MHN36AHQ",
  authDomain: "apka-576c1.firebaseapp.com",
  projectId: "apka-576c1",
  storageBucket: "apka-576c1.firebasestorage.app",
  messagingSenderId: "320118113243",
  appId: "1:320118113243:web:57d80fc99a123858d1ddfe"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentUserName = ""; 
let currentGroupId = null;
let currentGroupData = null;
let editingExpenseId = null;
let unsubscribeExpenses = null;
let unsubscribePayments = null;
let unsubscribeLogs = null;
let unsubscribeGroup = null;

let localExpenses = [];
let localPayments = [];

const authView = document.getElementById('auth-view');
const dashboardView = document.getElementById('dashboard-view');
const groupView = document.getElementById('group-view');
const groupSettingsView = document.getElementById('group-settings-view');

// ------------------- LOGOWANIE -------------------

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    currentUserName = await getUserNameByUid(user.uid);
    
    document.getElementById('user-name-display').innerText = currentUserName;
    document.getElementById('update-name-input').value = currentUserName;
    showDashboard();
    loadUserGroups();
  } else {
    currentUser = null;
    currentUserName = "";
    showAuth();
  }
});

async function getUserNameByUid(uid) {
  try {
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data().name || "Użytkownik";
    }
  } catch (e) {
    console.error("Błąd pobierania nazwy:", e);
  }
  return "Użytkownik";
}

document.getElementById('login-btn').addEventListener('click', async () => {
  const nameInput = document.getElementById('auth-name').value.trim();
  const password = document.getElementById('auth-password').value;

  if (!nameInput) {
    showError("Podaj swoją nazwę!");
    return;
  }
  if (!password || password.length < 6) {
    showError("Hasło musi mieć co najmniej 6 znaków!");
    return;
  }

  const fakeEmail = `${nameInput.toLowerCase().replace(/\s+/g, '')}@splitup.app`;

  try {
    await signInWithEmailAndPassword(auth, fakeEmail, password);
  } catch (loginError) {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, fakeEmail, password);
      const user = userCredential.user;

      await setDoc(doc(db, "users", user.uid), {
        name: nameInput
      });
    } catch (regError) {
      showError("Błędne hasło dla tej nazwy lub nazwa jest zajęta przez kogoś innego.");
    }
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  signOut(auth);
  cleanupListeners();
});

document.getElementById('update-name-btn').addEventListener('click', async () => {
  const newName = document.getElementById('update-name-input').value.trim();
  if (!newName) return alert("Nazwa nie może być pusta!");

  try {
    await updateDoc(doc(db, "users", currentUser.uid), {
      name: newName
    });

    currentUserName = newName;
    document.getElementById('user-name-display').innerText = currentUserName;
    alert("Zaktualizowano główną nazwę pomyślnie!");
  } catch (error) {
    console.error("Błąd aktualizacji nazwy:", error);
    alert("Wystąpił błąd podczas aktualizacji nazwy.");
  }
});

function showError(msg) {
  const errDiv = document.getElementById('auth-error');
  errDiv.innerText = msg;
  errDiv.style.display = 'block';
}

function showAuth() {
  authView.classList.remove('hidden');
  dashboardView.classList.add('hidden');
  groupView.classList.add('hidden');
  groupSettingsView.classList.add('hidden');
}

function showDashboard() {
  authView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  groupView.classList.add('hidden');
  groupSettingsView.classList.add('hidden');
  
  document.getElementById('new-group-member-name').value = currentUserName;
  document.getElementById('join-group-member-name').value = currentUserName;
  loadUserGroups();
}

function showGroup() {
  authView.classList.add('hidden');
  dashboardView.classList.add('hidden');
  groupView.classList.remove('hidden');
  groupSettingsView.classList.add('hidden');
}

function showGroupSettings() {
  authView.classList.add('hidden');
  dashboardView.classList.add('hidden');
  groupView.classList.add('hidden');
  groupSettingsView.classList.remove('hidden');

  const deleteGroupBtn = document.getElementById('delete-group-btn');
  const admins = currentGroupData?.admins || [];
  if (admins.includes(currentUser.uid)) {
    deleteGroupBtn.classList.remove('hidden');
  } else {
    deleteGroupBtn.classList.add('hidden');
  }
  
  if (currentGroupData) {
    renderMembersManagement(currentGroupData);
  }
}

function cleanupListeners() {
  if(unsubscribeExpenses) unsubscribeExpenses();
  if(unsubscribePayments) unsubscribePayments();
  if(unsubscribeLogs) unsubscribeLogs();
  if(unsubscribeGroup) unsubscribeGroup();
}

// ------------------- ZARZĄDZANIE GRUPAMI -------------------

async function loadUserGroups() {
  if (!currentUser) return;
  const groupsRef = collection(db, "groups");
  const q = query(groupsRef, where("members", "array-contains", currentUser.uid));
  
  const querySnapshot = await getDocs(q);
  const listDiv = document.getElementById('groups-list');
  listDiv.innerHTML = '';
  
  if (querySnapshot.empty) {
    listDiv.innerHTML = '<p style="color:var(--text-muted); font-size: 0.9rem;">Nie należysz jeszcze do żadnej grupy.</p>';
    return;
  }

  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const myNameInGroup = data.membersMap && data.membersMap[currentUser.uid] ? data.membersMap[currentUser.uid] : "Uczestnik";
    const div = document.createElement('div');
    div.className = 'group-list-item';
    div.innerHTML = `<span><strong>${data.name}</strong> <br><small style="color:var(--text-muted);">Twoje imię: ${myNameInGroup}</small></span> <button class="btn-small">Otwórz</button>`;
    div.onclick = () => openGroup(docSnap.id);
    listDiv.appendChild(div);
  });
}

document.getElementById('create-group-btn').addEventListener('click', async () => {
  const name = document.getElementById('new-group-name').value.trim();
  const memberName = document.getElementById('new-group-member-name').value.trim();

  if (!name) return alert("Podaj nazwę grupy");
  if (!memberName) return alert("Podaj swoją nazwę w tej grupie");
  
  let membersMap = {};
  membersMap[currentUser.uid] = memberName;

  let admins = [currentUser.uid];

  await addDoc(collection(db, "groups"), {
    name: name,
    members: [currentUser.uid], 
    membersMap: membersMap,
    admins: admins,    
    createdAt: serverTimestamp()
  });
  
  document.getElementById('new-group-name').value = '';
  loadUserGroups();
});

document.getElementById('join-group-btn').addEventListener('click', async () => {
  const groupId = document.getElementById('join-group-id').value.trim();
  const memberName = document.getElementById('join-group-member-name').value.trim();

  if (!groupId) return alert("Podaj ID grupy");
  if (!memberName) return alert("Podaj swoją nazwę w tej grupie");

  const groupRef = doc(db, "groups", groupId);
  const groupSnap = await getDoc(groupRef);

  if (groupSnap.exists()) {
    const data = groupSnap.data();
    let membersMap = data.membersMap || {};
    let members = data.members || [];
    let admins = data.admins || [];
    
    if (!members.includes(currentUser.uid)) {
      members.push(currentUser.uid);
    }
    membersMap[currentUser.uid] = memberName;

    await updateDoc(groupRef, { 
      members: members,
      membersMap: membersMap,
      admins: admins
    });

    document.getElementById('join-group-id').value = '';
    loadUserGroups();
    alert("Dołączono do grupy pomyślnie!");
  } else {
    alert("Grupa o takim ID nie istnieje!");
  }
});

// ------------------- WIDOK GRUPY -------------------

function openGroup(id) {
  currentGroupId = id;
  showGroup();

  unsubscribeGroup = onSnapshot(doc(db, "groups", id), (docSnap) => {
    if (docSnap.exists()) {
      currentGroupData = docSnap.data();
      
      if (!currentGroupData.members || !currentGroupData.members.includes(currentUser.uid)) {
        alert("Zostałeś wypisany z grupy lub grupa przestała istnieć.");
        document.getElementById('back-to-dash-btn').click();
        return;
      }

      const myNameInThisGroup = currentGroupData.membersMap && currentGroupData.membersMap[currentUser.uid] 
        ? currentGroupData.membersMap[currentUser.uid] 
        : currentUserName;

      document.getElementById('group-title').innerText = currentGroupData.name;
      document.getElementById('group-id-display').innerText = id;
      document.getElementById('group-rename-input').value = currentGroupData.name;

      updateGroupUI(currentGroupData.membersMap, myNameInThisGroup);
      renderMembersManagement(currentGroupData);
    }
  });

  listenToExpenses();
  listenToPayments();
  listenToLogs();
}

document.getElementById('back-to-dash-btn').addEventListener('click', () => {
  cleanupListeners();
  showDashboard();
});

document.getElementById('copy-group-id-btn').addEventListener('click', () => {
  navigator.clipboard.writeText(currentGroupId);
  alert(`Skopiowano ID grupy: ${currentGroupId}`);
});

document.getElementById('open-settings-btn').addEventListener('click', () => {
  showGroupSettings();
});

document.getElementById('back-to-group-btn').addEventListener('click', () => {
  showGroup();
});

document.getElementById('update-group-name-btn').addEventListener('click', async () => {
  const admins = currentGroupData.admins || [];
  const isAdmin = admins.includes(currentUser.uid);
  if (!isAdmin) return alert("Tylko administrator może zmienić nazwę grupy!");

  const newGroupName = document.getElementById('group-rename-input').value.trim();
  if (!newGroupName) return alert("Nazwa grupy nie może być pusta!");

  try {
    const groupRef = doc(db, "groups", currentGroupId);
    await updateDoc(groupRef, { name: newGroupName });
    addLogIdSafe(`[Grupa] Zmieniono nazwę grupy na "${newGroupName}".`, 'info');
    alert("Zmieniono nazwę grupy!");
  } catch (error) {
    console.error("Błąd zmiany nazwy grupy:", error);
    alert("Nie udało się zmienić nazwy grupy.");
  }
});

document.getElementById('delete-group-btn').addEventListener('click', async () => {
  const admins = currentGroupData.admins || [];
  const isAdmin = admins.includes(currentUser.uid);
  
  if (!isAdmin) {
    return alert("Tylko administrator może usunąć całą grupę!");
  }

  if (!confirm("Czy na pewno chcesz bezpowrotnie usunąć tę grupę? Ta operacja usunie wszystkie wydatki, spłaty i historię dla wszystkich uczestników.")) {
    return;
  }

  try {
    const groupRef = doc(db, "groups", currentGroupId);
    await deleteDoc(groupRef);

    alert("Grupa została pomyślnie usunięta.");
    document.getElementById('back-to-dash-btn').click();
  } catch (error) {
    console.error("Błąd podczas usuwania grupy:", error);
    alert("Nie udało się usunąć grupy.");
  }
});

function renderMembersManagement(groupData) {
  const container = document.getElementById('manage-members-list');
  if (!container) return;
  container.innerHTML = '';

  const membersMap = groupData.membersMap || {};
  const admins = groupData.admins || [];
  const currentUserIsAdmin = admins.includes(currentUser.uid);

  // Sumowanie wydatków dla każdego użytkownika (jego udziały w wydatkach)
  const userTotals = {};
  Object.values(membersMap).forEach(name => userTotals[name] = 0);
  localExpenses.forEach(exp => {
    for (let [userName, amount] of Object.entries(exp.shares)) {
      if (userTotals[userName] !== undefined) {
        userTotals[userName] += amount;
      }
    }
  });

  for (let [uid, name] of Object.entries(membersMap)) {
    const isMe = (uid === currentUser.uid);
    const isUserAdmin = admins.includes(uid);
    const totalSpent = (userTotals[name] || 0).toFixed(2);
    
    const row = document.createElement('div');
    row.style.background = '#f9f9f9';
    row.style.padding = '10px';
    row.style.borderRadius = '6px';
    row.style.border = '1px solid #eee';
    row.style.marginBottom = '8px';

    let html = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <strong style="font-size: 0.95rem;">${name} ${isMe ? '(Ty)' : ''}</strong>
        <span style="font-size: 0.75rem; padding: 2px 6px; background: ${isUserAdmin ? '#e3f2fd' : '#eee'}; color: ${isUserAdmin ? '#1976d2' : '#666'}; border-radius: 4px; font-weight: 600;">
          ${isUserAdmin ? '👑 Administrator' : '👤 Członek'}
        </span>
      </div>
      <div style="font-size: 0.85rem; color: var(--accent); font-weight: 600; margin-bottom: 6px;">
        Wydane łącznie: ${totalSpent} zł
      </div>
    `;

    if (currentUserIsAdmin || isMe) {
      html += `
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
          <input type="text" value="${name}" id="member-name-${uid}" style="margin-bottom:0;" placeholder="Nowa ksywka">
          <button class="btn-small btn-secondary" onclick="window.saveMemberName('${uid}')" style="white-space:nowrap; width:auto;">Zapisz ksywkę</button>
        </div>
      `;
    } else {
      html += `<div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 6px;">Ksywka: ${name}</div>`;
    }

    if (currentUserIsAdmin && !isMe) {
      const toggleAdminText = isUserAdmin ? 'Odbierz admina' : 'Nadaj admina';
      const toggleAdminAction = isUserAdmin ? 'demoteAdmin' : 'promoteAdmin';

      html += `
        <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; border-top: 1px dashed #ddd; padding-top: 8px;">
          <button class="btn-small btn-secondary" onclick="window.${toggleAdminAction}('${uid}')" style="width: auto; font-size: 0.75rem;">${toggleAdminText}</button>
          <button class="btn-small btn-danger" onclick="window.removeGroupMember('${uid}', '${name}')" style="width: auto; font-size: 0.75rem;">Usuń z grupy</button>
        </div>
      `;
    }

    row.innerHTML = html;
    container.appendChild(row);
  }
}

window.saveMemberName = async function(targetUid) {
  const isMe = (targetUid === currentUser.uid);
  const admins = currentGroupData.admins || [];
  const isAdmin = admins.includes(currentUser.uid);

  if (!isMe && !isAdmin) {
    return alert("Nie masz uprawnień do zmiany nazwy tego użytkownika!");
  }

  const inputEl = document.getElementById(`member-name-${targetUid}`);
  const newName = inputEl ? inputEl.value.trim() : "";
  if (!newName) return alert("Nazwa nie może być pusta!");

  try {
    const groupRef = doc(db, "groups", currentGroupId);
    const groupSnap = await getDoc(groupRef);
    if (groupSnap.exists()) {
      let data = groupSnap.data();
      if (!data.membersMap) data.membersMap = {};
      
      const oldName = data.membersMap[targetUid];
      data.membersMap[targetUid] = newName;

      await updateDoc(groupRef, { membersMap: data.membersMap });
      addLogIdSafe(`[Zarządzanie] Zmieniono ksywkę użytkownika z "${oldName}" na "${newName}".`, 'info');
      alert("Zaktualizowano nazwę członka grupy!");
    }
  } catch (error) {
    console.error("Błąd edycji nazwy użytkownika:", error);
    alert("Wystąpił błąd.");
  }
};

window.promoteAdmin = async function(targetUid) {
  try {
    const groupRef = doc(db, "groups", currentGroupId);
    const groupSnap = await getDoc(groupRef);
    if (groupSnap.exists()) {
      let data = groupSnap.data();
      let admins = data.admins || [];
      
      if (!admins.includes(targetUid)) {
        admins.push(targetUid);
        await updateDoc(groupRef, { admins: admins });
        const targetName = data.membersMap[targetUid] || "Użytkownik";
        addLogIdSafe(`[Admin] Nadano uprawnienia administratora użytkownikowi "${targetName}".`, 'info');
        alert("Nadano rangę administratora.");
      }
    }
  } catch (e) {
    console.error("Błąd nadawania admina:", e);
  }
};

window.demoteAdmin = async function(targetUid) {
  try {
    const groupRef = doc(db, "groups", currentGroupId);
    const groupSnap = await getDoc(groupRef);
    if (groupSnap.exists()) {
      let data = groupSnap.data();
      let admins = data.admins || [];
      
      if (admins.length <= 1) {
        return alert("Grupa musi mieć przynajmniej jednego administratora!");
      }

      admins = admins.filter(id => id !== targetUid);
      await updateDoc(groupRef, { admins: admins });
      const targetName = data.membersMap[targetUid] || "Użytkownik";
      addLogIdSafe(`[Admin] Odebrano uprawnienia administratora użytkownikowi "${targetName}".`, 'info');
      alert("Odebrano rangę administratora.");
    }
  } catch (e) {
    console.error("Błąd odbierania admina:", e);
  }
};

window.removeGroupMember = async function(targetUid, targetName) {
  const admins = currentGroupData.admins || [];
  const isAdmin = admins.includes(currentUser.uid);
  if (!isAdmin) return alert("Tylko administrator może usuwać członków z grupy!");

  if (!confirm(`Czy na pewno chcesz usunąć użytkownika "${targetName}" z grupy?`)) return;

  try {
    const groupRef = doc(db, "groups", currentGroupId);
    const groupSnap = await getDoc(groupRef);
    if (groupSnap.exists()) {
      let data = groupSnap.data();
      
      let members = (data.members || []).filter(id => id !== targetUid);
      let membersMap = data.membersMap || {};
      delete membersMap[targetUid];
      let groupAdmins = (data.admins || []).filter(id => id !== targetUid);

      await updateDoc(groupRef, {
        members: members,
        membersMap: membersMap,
        admins: groupAdmins
      });

      addLogIdSafe(`[Zarządzanie] Usunięto użytkownika "${targetName}" z grupy.`, 'delete');
      alert("Usunięto użytkownika z grupy.");
    }
  } catch (error) {
    console.error("Błąd usuwania użytkownika:", error);
    alert("Nie udało się usunąć użytkownika.");
  }
};

document.getElementById('leave-group-btn').addEventListener('click', async () => {
  if (!confirm("Czy na pewno chcesz opuścić tę grupę? Stracisz do niej dostęp.")) return;

  try {
    const groupRef = doc(db, "groups", currentGroupId);
    const groupSnap = await getDoc(groupRef);
    if (groupSnap.exists()) {
      let data = groupSnap.data();
      
      let admins = data.admins || [];
      const isLeavingAdmin = admins.includes(currentUser.uid);
      if (isLeavingAdmin && admins.length === 1 && (data.members || []).length > 1) {
        alert("Jesteś jedynym administratorem. Przed opuszczeniem grupy nadaj komuś innemu uprawnienia administratora!");
        return;
      }

      let members = (data.members || []).filter(uid => uid !== currentUser.uid);
      let membersMap = data.membersMap || {};
      delete membersMap[currentUser.uid];
      let groupAdmins = admins.filter(uid => uid !== currentUser.uid);

      await updateDoc(groupRef, {
        members: members,
        membersMap: membersMap,
        admins: groupAdmins
      });

      alert("Opuszczono grupę.");
      document.getElementById('back-to-dash-btn').click();
    }
  } catch (error) {
    console.error("Błąd podczas opuszczania grupy:", error);
    alert("Nie udało się opuścić grupy.");
  }
});

function updateGroupUI(membersMap, myNameInThisGroup) {
  const payerSelect = document.getElementById('expense-payer');
  const payFrom = document.getElementById('payment-from');
  const payTo = document.getElementById('payment-to');

  const names = Object.values(membersMap);
  const options = names.map(name => `<option value="${name}">${name}</option>`).join('');
  
  payerSelect.innerHTML = options;
  payFrom.innerHTML = options;
  payTo.innerHTML = options;

  if (!names.includes(payerSelect.value)) payerSelect.value = myNameInThisGroup;
  if (!names.includes(payFrom.value)) payFrom.value = myNameInThisGroup;

  document.getElementById('equal-users-list').innerHTML = names.map(name => `
    <label class="checkbox-label">
      <input type="checkbox" value="${name}" checked class="equal-user-check"> ${name}
    </label>
  `).join('');

  document.getElementById('exact-users-list').innerHTML = names.map(name => `
    <div class="split-item">
      <span>${name}</span>
      <input type="number" placeholder="0.00 PLN" data-user="${name}" class="exact-user-input" step="0.01">
    </div>
  `).join('');
}

async function addLogToDB(message, type = 'info') {
  if (!currentGroupId) return;
  await addDoc(collection(db, `groups/${currentGroupId}/logs`), {
    text: message,
    type: type,
    createdAt: serverTimestamp()
  });
}

function addLogIdSafe(message, type = 'info') {
  addLogToDB(message, type);
}

// ------------------- WYDATKI I SPŁATY -------------------

document.getElementById('save-expense-btn').addEventListener('click', async () => {
  const title = document.getElementById('expense-title').value.trim();
  const payer = document.getElementById('expense-payer').value;
  const type = document.getElementById('split-type').value;
  const myNameInThisGroup = currentGroupData.membersMap[currentUser.uid];
  
  if (!title) return alert('Wpisz nazwę wydatku');

  let shares = {};
  let total = 0;

  if (type === 'equal') {
    total = parseFloat(document.getElementById('expense-amount').value);
    if (!total || total <= 0) return alert('Wpisz poprawną kwotę');
    
    const selectedUsers = Array.from(document.querySelectorAll('.equal-user-check:checked')).map(cb => cb.value);
    if (selectedUsers.length === 0) return alert('Wybierz przynajmniej jedną osobę');

    const splitAmount = total / selectedUsers.length;
    selectedUsers.forEach(u => shares[u] = splitAmount);
  } else {
    const inputs = document.querySelectorAll('.exact-user-input');
    inputs.forEach(input => {
      const val = parseFloat(input.value) || 0;
      if (val > 0) {
        shares[input.dataset.user] = val;
        total += val;
      }
    });
    if (total <= 0) return alert('Wpisz kwotę dla co najmniej jednej osoby');
  }

  const expenseData = {
    title, payer, total, shares,
    updatedAt: serverTimestamp()
  };

  if (editingExpenseId) {
    const docRef = doc(db, `groups/${currentGroupId}/expenses`, editingExpenseId);
    await updateDoc(docRef, expenseData);
    addLogToDB(`[Edycja] ${myNameInThisGroup} edytował(a) wydatek "${title}".`, 'info');
    editingExpenseId = null;
    document.getElementById('save-expense-btn').innerText = 'Zapisz wydatek';
    document.getElementById('cancel-edit-btn').classList.add('hidden');
  } else {
    expenseData.createdAt = serverTimestamp();
    await addDoc(collection(db, `groups/${currentGroupId}/expenses`), expenseData);
    addLogToDB(`[Wydatek] ${myNameInThisGroup} dodał(a) wydatek "${title}" (${total.toFixed(2)} zł).`, 'info');
  }

  document.getElementById('expense-title').value = '';
  document.getElementById('expense-amount').value = '';
  document.querySelectorAll('.exact-user-input').forEach(i => i.value = '');
});

document.getElementById('cancel-edit-btn').addEventListener('click', () => {
  editingExpenseId = null;
  document.getElementById('save-expense-btn').innerText = 'Zapisz wydatek';
  document.getElementById('cancel-edit-btn').classList.add('hidden');
  document.getElementById('expense-title').value = '';
  document.getElementById('expense-amount').value = '';
});

window.editExpense = function(id) {
  const exp = localExpenses.find(e => e.id === id);
  if(!exp) return;
  editingExpenseId = id;
  document.getElementById('expense-title').value = exp.title;
  document.getElementById('expense-payer').value = exp.payer;
  document.getElementById('expense-amount').value = exp.total;
  document.getElementById('save-expense-btn').innerText = 'Zapisz zmiany';
  document.getElementById('cancel-edit-btn').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteExpense = async function(id, title, total) {
  const myNameInThisGroup = currentGroupData.membersMap[currentUser.uid];
  if(confirm(`Usunąć wydatek "${title}"?`)) {
    await deleteDoc(doc(db, `groups/${currentGroupId}/expenses`, id));
    addLogToDB(`[Usunięto] ${myNameInThisGroup} usunął(ęła) wydatek "${title}" (${total.toFixed(2)} zł).`, 'delete');
  }
};

window.showExpenseDetails = function(id) {
  const exp = localExpenses.find(e => e.id === id);
  if (!exp) return;

  document.getElementById('modal-expense-title').innerText = exp.title;
  document.getElementById('modal-expense-payer').innerText = exp.payer;
  document.getElementById('modal-expense-total').innerText = `${exp.total.toFixed(2)} zł`;

  const sharesListDiv = document.getElementById('modal-shares-list');
  sharesListDiv.innerHTML = '';

  for (let [user, amount] of Object.entries(exp.shares)) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.fontSize = '0.9rem';
    row.style.padding = '4px 0';
    row.style.borderBottom = '1px solid #eee';
    row.innerHTML = `<span>${user}</span> <strong>${amount.toFixed(2)} zł</strong>`;
    sharesListDiv.appendChild(row);
  }

  document.getElementById('expense-details-modal').classList.remove('hidden');
};

document.getElementById('add-payment-btn').addEventListener('click', async () => {
  const from = document.getElementById('payment-from').value;
  const to = document.getElementById('payment-to').value;
  const amount = parseFloat(document.getElementById('payment-amount').value);
  const myNameInThisGroup = currentGroupData.membersMap[currentUser.uid];

  if (from === to) return alert('Nie można oddać pieniędzy samemu sobie');
  if (!amount || amount <= 0) return alert('Wpisz poprawną kwotę');

  await addDoc(collection(db, `groups/${currentGroupId}/payments`), {
    from, to, amount,
    createdAt: serverTimestamp()
  });

  addLogToDB(`[Spłata] ${myNameInThisGroup} zarejestrował(a) spłatę: ${from} ➔ ${to} (${amount.toFixed(2)} zł).`, 'payment');
  document.getElementById('payment-amount').value = '';
});

// ------------------- NASŁUCHIWANIE I RENDEROWANIE -------------------

function listenToExpenses() {
  const q = query(collection(db, `groups/${currentGroupId}/expenses`), orderBy("createdAt", "desc"));
  unsubscribeExpenses = onSnapshot(q, (snapshot) => {
    localExpenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderHistory();
    calculateBalances();
    // Odświeżamy też listę zarządzania członkami, jeśli jest aktualnie otwarta (zmieniają się sumy kwot)
    if (!groupSettingsView.classList.contains('hidden') && currentGroupData) {
      renderMembersManagement(currentGroupData);
    }
  });
}

function listenToPayments() {
  const q = query(collection(db, `groups/${currentGroupId}/payments`), orderBy("createdAt", "desc"));
  unsubscribePayments = onSnapshot(q, (snapshot) => {
    localPayments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    calculateBalances();
  });
}

function listenToLogs() {
  const q = query(collection(db, `groups/${currentGroupId}/logs`), orderBy("createdAt", "desc"));
  unsubscribeLogs = onSnapshot(q, (snapshot) => {
    const logs = snapshot.docs.map(doc => doc.data());
    const logsDiv = document.getElementById('logs-history');
    if (logs.length === 0) {
      logsDiv.innerHTML = '<p style="font-size:0.8rem; color:var(--text-muted); margin:0;">Brak akcji w historii.</p>';
      return;
    }
    logsDiv.innerHTML = logs.map(l => {
      const dateStr = l.createdAt ? l.createdAt.toDate().toLocaleString() : 'Teraz';
      return `
      <div class="log-item ${l.type}">
        <div class="log-time">${dateStr}</div>
        <div>${l.text}</div>
      </div>`;
    }).join('');
  });
}

function renderHistory() {
  const historyDiv = document.getElementById('expenses-history');
  if (localExpenses.length === 0) {
    historyDiv.innerHTML = '<p style="font-size:0.9rem; color:var(--text-muted); margin:0;">Brak wydatków.</p>';
    return;
  }

  historyDiv.innerHTML = localExpenses.map(e => `
    <div class="list-item">
      <div>
        <div style="font-weight:600;">${e.title}</div>
        <div style="font-size:0.8rem; color:var(--text-muted);">Płacił(a): ${e.payer}</div>
        <div class="item-actions">
          <button onclick="window.showExpenseDetails('${e.id}')" class="btn-small btn-secondary">🔍 Szczegóły</button>
          <button onclick="window.editExpense('${e.id}')" class="btn-small btn-secondary">✏️ Edytuj</button>
          <button onclick="window.deleteExpense('${e.id}', '${e.title}', ${e.total})" class="btn-small btn-danger">🗑️ Usuń</button>
        </div>
      </div>
      <span class="badge">${e.total.toFixed(2)} zł</span>
    </div>
  `).join('');
}

function calculateBalances() {
  if(!currentGroupData || !currentGroupData.membersMap) return;
  
  let balances = {};
  Object.values(currentGroupData.membersMap).forEach(name => balances[name] = 0);

  localExpenses.forEach(exp => {
    if(balances[exp.payer] !== undefined) balances[exp.payer] += exp.total;
    for (let user in exp.shares) {
      if(balances[user] !== undefined) balances[user] -= exp.shares[user];
    }
  });

  localPayments.forEach(p => {
    if(balances[p.from] !== undefined) balances[p.from] += p.amount;
    if(balances[p.to] !== undefined) balances[p.to] -= p.amount;
  });

  let debtors = [];
  let creditors = [];

  for (let user in balances) {
    if (balances[user] < -0.01) debtors.push({ user, amount: -balances[user] });
    if (balances[user] > 0.01) creditors.push({ user, amount: balances[user] });
  }

  let transactions = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    let amount = Math.min(debtors[i].amount, creditors[j].amount);
    transactions.push(`<span>${debtors[i].user} ➔ ${creditors[j].user}</span> <strong>${amount.toFixed(2)} zł</strong>`);
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount < 0.01) i++;
    if (creditors[j].amount < 0.01) j++;
  }

  const settlementsDiv = document.getElementById('settlements-list');
  settlementsDiv.innerHTML = transactions.length 
    ? transactions.map(t => `<div class="settlement-card">${t}</div>`).join('') 
    : '<p style="font-size:0.9rem; color:var(--text-muted); margin:0;">Wszyscy są rozliczeni!</p>';
}
