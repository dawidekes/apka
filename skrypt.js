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
let unsubscribeGroup = null; // Nasłuchiwacz zmian w samej grupie (np. gdy ktoś zmieni nazwę)

let localExpenses = [];
let localPayments = [];

const authView = document.getElementById('auth-view');
const dashboardView = document.getElementById('dashboard-view');
const groupView = document.getElementById('group-view');

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
}

function showDashboard() {
  authView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  groupView.classList.add('hidden');
  
  document.getElementById('new-group-member-name').value = currentUserName;
  document.getElementById('join-group-member-name').value = currentUserName;
  loadUserGroups();
}

function showGroup() {
  authView.classList.add('hidden');
  dashboardView.classList.add('hidden');
  groupView.classList.remove('hidden');
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

  await addDoc(collection(db, "groups"), {
    name: name,
    members: [currentUser.uid], 
    membersMap: membersMap,     
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
    if(!data.membersMap) data.membersMap = {};
    
    if (!data.members.includes(currentUser.uid)) {
      data.members.push(currentUser.uid);
    }
    data.membersMap[currentUser.uid] = memberName;

    await updateDoc(groupRef, { 
      members: data.members,
      membersMap: data.membersMap
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

  // Nasłuchuj na żywo zmian w dokumencie grupy (np. gdy ktoś zmieni nazwę członka)
  unsubscribeGroup = onSnapshot(doc(db, "groups", id), (docSnap) => {
    if (docSnap.exists()) {
      currentGroupData = docSnap.data();
      
      // Jeśli użytkownik z jakiegoś powodu został usunięty lub nie ma go w grupie
      if (!currentGroupData.members.includes(currentUser.uid)) {
        alert("Zostałeś wypisany z grupy lub grupa przestała istnieć.");
        document.getElementById('back-to-dash-btn').click();
        return;
      }

      const myNameInThisGroup = currentGroupData.membersMap && currentGroupData.membersMap[currentUser.uid] 
        ? currentGroupData.membersMap[currentUser.uid] 
        : currentUserName;

      document.getElementById('group-title').innerText = currentGroupData.name;
      document.getElementById('group-id-display').innerText = id;
      document.getElementById('group-member-name-input').value = myNameInThisGroup;

      updateGroupUI(currentGroupData.membersMap, myNameInThisGroup);
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

// Zmiana nazwy użytkownika wewnątrz konkretnej grupy
document.getElementById('update-group-member-name-btn').addEventListener('click', async () => {
  const newName = document.getElementById('group-member-name-input').value.trim();
  if (!newName) return alert("Nazwa w grupie nie może być pusta!");

  try {
    const groupRef = doc(db, "groups", currentGroupId);
    const groupSnap = await getDoc(groupRef);
    if (groupSnap.exists()) {
      let data = groupSnap.data();
      if (!data.membersMap) data.membersMap = {};
      
      const oldName = data.membersMap[currentUser.uid];
      data.membersMap[currentUser.uid] = newName;

      await updateDoc(groupRef, {
        membersMap: data.membersMap
      });

      addLogIdSafe(`[Profil] Uczestnik zmienił nazwę z "${oldName}" na "${newName}".`, 'info');
      alert("Zaktualizowano Twoją nazwę w tej grupie!");
    }
  } catch (error) {
    console.error("Błąd zmiany nazwy w grupie:", error);
    alert("Wystąpił błąd podczas aktualizacji nazwy.");
  }
});

// Opuść grupę
document.getElementById('leave-group-btn').addEventListener('click', async () => {
  if (!confirm("Czy na pewno chcesz opuścić tę grupę? Stracisz do niej dostęp.")) return;

  try {
    const groupRef = doc(db, "groups", currentGroupId);
    const groupSnap = await getDoc(groupRef);
    if (groupSnap.exists()) {
      let data = groupSnap.data();
      
      // Usuń użytkownika z listy members oraz z membersMap
      data.members = data.members.filter(uid => uid !== currentUser.uid);
      if (data.membersMap) {
        delete data.membersMap[currentUser.uid];
      }

      await updateDoc(groupRef, {
        members: data.members,
        membersMap: data.membersMap
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

  // Zachowaj wybrane wcześniej opcje jeśli to możliwe, lub ustaw domyślne
  if (names.includes(payerSelect.value)) {
    // zostaw jak było
  } else {
    payerSelect.value = myNameInThisGroup;
  }

  if (names.includes(payFrom.value)) {
    // zostaw
  } else {
    payFrom.value = myNameInThisGroup;
  }

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
}

window.deleteExpense = async function(id, title, total) {
  const myNameInThisGroup = currentGroupData.membersMap[currentUser.uid];
  if(confirm(`Usunąć wydatek "${title}"?`)) {
    await deleteDoc(doc(db, `groups/${currentGroupId}/expenses`, id));
    addLogToDB(`[Usunięto] ${myNameInThisGroup} usunął(ęła) wydatek "${title}" (${total.toFixed(2)} zł).`, 'delete');
  }
}

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
  });
}

function listenToPayments() {
  const q = query(collection(db, `groups/${currentGroupId}/payments`));
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
