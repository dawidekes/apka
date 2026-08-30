// 1. ZAAIMPORTUJ FUNKCJE FIREBASE (Moduły)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, 
  onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
  getFirestore, collection, addDoc, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, 
  onSnapshot, query, where, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 2. TUTAJ WKLEJ SWOJĄ KONFIGURACJĘ FIREBASE!
const firebaseConfig = {
  apiKey: "AIzaSyBf5mCIwJppnrIMXtOuplARaO9MHN36AHQ",
  authDomain: "apka-576c1.firebaseapp.com",
  projectId: "apka-576c1",
  storageBucket: "apka-576c1.firebasestorage.app",
  messagingSenderId: "320118113243",
  appId: "1:320118113243:web:57d80fc99a123858d1ddfe"
};

// Inicjalizacja Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Zmienne stanu aplikacji
let currentUser = null;
let currentUserName = ""; // Przechowuje imię zalogowanego użytkownika
let currentGroupId = null;
let currentGroupData = null;
let editingExpenseId = null;
let unsubscribeExpenses = null;
let unsubscribePayments = null;
let unsubscribeLogs = null;

let localExpenses = [];
let localPayments = [];

// Elementy DOM
const authView = document.getElementById('auth-view');
const dashboardView = document.getElementById('dashboard-view');
const groupView = document.getElementById('group-view');

// ------------------- LOGOWANIE I AUTORYZACJA -------------------

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    // Pobierz imię użytkownika z bazy Firestore
    currentUserName = await getUserNameByUid(user.uid);
    
    document.getElementById('user-email-display').innerText = `${currentUserName} (${user.email})`;
    showDashboard();
    loadUserGroups();
  } else {
    currentUser = null;
    currentUserName = "";
    showAuth();
  }
});

// Pomocnicza funkcja do pobierania imienia po UID
async function getUserNameByUid(uid) {
  try {
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data().imie || currentUser.email;
    }
  } catch (e) {
    console.error("Błąd pobierania imienia:", e);
  }
  return currentUser.email;
}

document.getElementById('register-btn').addEventListener('click', async () => {
  const name = document.getElementById('auth-name').value.trim();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;

  if (!name) {
    showError("Podaj swoje imię!");
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Zapisz imię w bazie danych w kolekcji "users" pod adresem UID użytkownika
    await setDoc(doc(db, "users", user.uid), {
      imie: name,
      email: email
    });

  } catch (error) {
    showError(error.message);
  }
});

document.getElementById('login-btn').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    showError("Błędny email lub hasło!");
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  signOut(auth);
  if(unsubscribeExpenses) unsubscribeExpenses();
  if(unsubscribePayments) unsubscribePayments();
  if(unsubscribeLogs) unsubscribeLogs();
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
}

function showGroup() {
  authView.classList.add('hidden');
  dashboardView.classList.add('hidden');
  groupView.classList.remove('hidden');
}

// ------------------- ZARZĄDZANIE GRUPAMI (DASHBOARD) -------------------

async function loadUserGroups() {
  const groupsRef = collection(db, "groups");
  const q = query(groupsRef, where("members", "array-contains", currentUser.uid));
  
  const querySnapshot = await getDocs(q);
  const listDiv = document.getElementById('groups-list');
  listDiv.innerHTML = '';
  
  if (querySnapshot.empty) {
    listDiv.innerHTML = '<p style="color:var(--text-muted); font-size: 0.9rem;">Nie należysz jeszcze do żadnej grupy.</p>';
    return;
  }

  querySnapshot.forEach((doc) => {
    const data = doc.data();
    const div = document.createElement('div');
    div.className = 'group-list-item';
    div.innerHTML = `<span><strong>${data.name}</strong> (${Object.keys(data.membersMap || {}).length} os.)</span> <button class="btn-small">Otwórz</button>`;
    div.onclick = () => openGroup(doc.id, data);
    listDiv.appendChild(div);
  });
}

document.getElementById('create-group-btn').addEventListener('click', async () => {
  const name = document.getElementById('new-group-name').value.trim();
  if (!name) return alert("Podaj nazwę grupy");
  
  let membersMap = {};
  membersMap[currentUser.uid] = currentUserName;

  await addDoc(collection(db, "groups"), {
    name: name,
    members: [currentUser.uid], // Tablica UID do łatwego filtrowania zapytaniem array-contains
    membersMap: membersMap,     // Mapa łącząca UID z Imieniem
    createdAt: serverTimestamp()
  });
  
  document.getElementById('new-group-name').value = '';
  loadUserGroups();
});

document.getElementById('join-group-btn').addEventListener('click', async () => {
  const groupId = document.getElementById('join-group-id').value.trim();
  if (!groupId) return alert("Podaj ID grupy");

  const groupRef = doc(db, "groups", groupId);
  const groupSnap = await getDoc(groupRef);

  if (groupSnap.exists()) {
    const data = groupSnap.data();
    if (!data.members.includes(currentUser.uid)) {
      data.members.push(currentUser.uid);
      if(!data.membersMap) data.membersMap = {};
      data.membersMap[currentUser.uid] = currentUserName;

      await updateDoc(groupRef, { 
        members: data.members,
        membersMap: data.membersMap
      });
    }
    document.getElementById('join-group-id').value = '';
    loadUserGroups();
  } else {
    alert("Grupa o takim ID nie istnieje!");
  }
});

// ------------------- WIDOK GRUPY (AKCJE) -------------------

function openGroup(id, data) {
  currentGroupId = id;
  currentGroupData = data;
  
  document.getElementById('group-title').innerText = data.name;
  document.getElementById('group-id-display').innerText = id;
  showGroup();

  // Zbuduj UI opierając się na mapie imion członków
  updateGroupUI(data.membersMap);

  listenToExpenses();
  listenToPayments();
  listenToLogs();
}

document.getElementById('back-to-dash-btn').addEventListener('click', () => {
  if(unsubscribeExpenses) unsubscribeExpenses();
  if(unsubscribePayments) unsubscribePayments();
  if(unsubscribeLogs) unsubscribeLogs();
  showDashboard();
});

document.getElementById('copy-group-id-btn').addEventListener('click', () => {
  navigator.clipboard.writeText(currentGroupId);
  alert(`Skopiowano ID grupy: ${currentGroupId}`);
});

function updateGroupUI(membersMap) {
  const payerSelect = document.getElementById('expense-payer');
  const payFrom = document.getElementById('payment-from');
  const payTo = document.getElementById('payment-to');

  // Tworzymy opcje select na podstawie mapy (klucz to UID, wartość to Imię)
  const options = Object.entries(membersMap).map(([uid, name]) => `<option value="${name}">${name}</option>`).join('');
  payerSelect.innerHTML = options;
  payFrom.innerHTML = options;
  payTo.innerHTML = options;

  payerSelect.value = currentUserName;
  payFrom.value = currentUserName;

  document.getElementById('equal-users-list').innerHTML = Object.entries(membersMap).map(([uid, name]) => `
    <label class="checkbox-label">
      <input type="checkbox" value="${name}" checked class="equal-user-check"> ${name}
    </label>
  `).join('');

  document.getElementById('exact-users-list').innerHTML = Object.entries(membersMap).map(([uid, name]) => `
    <div class="split-item">
      <span>${name}</span>
      <input type="number" placeholder="0.00 PLN" data-user="${name}" class="exact-user-input" step="0.01">
    </div>
  `).join('');
}

document.getElementById('split-type').addEventListener('change', (e) => {
  if (e.target.value === 'equal') {
    document.getElementById('equal-split-section').classList.remove('hidden');
    document.getElementById('exact-split-section').classList.add('hidden');
  } else {
    document.getElementById('equal-split-section').classList.add('hidden');
    document.getElementById('exact-split-section').classList.remove('hidden');
  }
});

async function addLogToDB(message, type = 'info') {
  await addDoc(collection(db, `groups/${currentGroupId}/logs`), {
    text: message,
    type: type,
    createdAt: serverTimestamp()
  });
}

// ------------------- WYDATKI (CRUD) -------------------

document.getElementById('save-expense-btn').addEventListener('click', async () => {
  const title = document.getElementById('expense-title').value.trim();
  const payer = document.getElementById('expense-payer').value;
  const type = document.getElementById('split-type').value;
  
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
    addLogToDB(`[Edycja] ${currentUserName} edytował(a) wydatek "${title}".`, 'info');
    editingExpenseId = null;
    document.getElementById('save-expense-btn').innerText = 'Zapisz wydatek';
    document.getElementById('cancel-edit-btn').classList.add('hidden');
  } else {
    expenseData.createdAt = serverTimestamp();
    await addDoc(collection(db, `groups/${currentGroupId}/expenses`), expenseData);
    addLogToDB(`[Wydatek] ${currentUserName} dodał(a) wydatek "${title}" (${total.toFixed(2)} zł).`, 'info');
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
  if(confirm(`Usunąć wydatek "${title}"?`)) {
    await deleteDoc(doc(db, `groups/${currentGroupId}/expenses`, id));
    addLogToDB(`[Usunięto] ${currentUserName} usunął(ęła) wydatek "${title}" (${total.toFixed(2)} zł).`, 'delete');
  }
}

// ------------------- SPŁATY (CRUD) -------------------

document.getElementById('add-payment-btn').addEventListener('click', async () => {
  const from = document.getElementById('payment-from').value;
  const to = document.getElementById('payment-to').value;
  const amount = parseFloat(document.getElementById('payment-amount').value);

  if (from === to) return alert('Nie można oddać pieniędzy samemu sobie');
  if (!amount || amount <= 0) return alert('Wpisz poprawną kwotę');

  await addDoc(collection(db, `groups/${currentGroupId}/payments`), {
    from, to, amount,
    createdAt: serverTimestamp()
  });

  addLogToDB(`[Spłata] ${currentUserName} zarejestrował(a) spłatę: ${from} ➔ ${to} (${amount.toFixed(2)} zł).`, 'payment');
  document.getElementById('payment-amount').value = '';
});

// ------------------- NASŁUCHIWANIE I RENDEROWANIE (REAL-TIME) -------------------

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
  // Inicjalizujemy bilanse używając imion członków z mapy
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