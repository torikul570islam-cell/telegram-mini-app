<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Like4Like Telegram Mini App</title>
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- Telegram Web App Script -->
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <!-- FontAwesome Icons -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        .tab-content { display: none; }
        .tab-content.active { display: block; }
    </style>
</head>
<body class="bg-gray-900 text-white font-sans antialiased min-h-screen flex flex-col justify-between">

    <!-- Header / Navbar -->
    <header class="bg-gray-800 p-4 shadow-md flex justify-between items-center border-b border-gray-700">
        <div class="flex items-center space-x-2">
            <i class="fa-solid fa-fire text-yellow-400 text-xl"></i>
            <h1 class="font-bold text-lg">Like4Like App</h1>
        </div>
        <div class="flex items-center space-x-3">
            <!-- Points Balance -->
            <div class="bg-gray-700 px-3 py-1 rounded-full flex items-center space-x-1 text-sm font-semibold">
                <i class="fa-solid fa-coins text-yellow-400"></i>
                <span id="user-points">0</span> Points
            </div>
            <!-- Stars Balance -->
            <div class="bg-gray-700 px-3 py-1 rounded-full flex items-center space-x-1 text-sm font-semibold">
                <i class="fa-solid fa-star text-purple-400"></i>
                <span id="user-stars">0</span> Stars
            </div>
        </div>
    </header>

    <!-- Main Container -->
    <main class="p-4 flex-grow mb-16">
        
        <!-- 1. EARN TAB -->
        <div id="tab-earn" class="tab-content active space-y-4">
            <h2 class="text-xl font-bold mb-2"><i class="fa-solid fa-tasks text-blue-400"></i> Available Tasks</h2>
            <div id="tasks-container" class="space-y-3">
                <!-- Task items will load dynamically here -->
                <p class="text-gray-400 text-center py-6">Loading tasks...</p>
            </div>
        </div>

        <!-- 2. CREATE TASK TAB -->
        <div id="tab-create" class="tab-content space-y-4">
            <h2 class="text-xl font-bold mb-2"><i class="fa-solid fa-plus-circle text-green-400"></i> Create New Task</h2>
            <form id="create-task-form" class="bg-gray-800 p-4 rounded-xl shadow border border-gray-700 space-y-3">
                <div>
                    <label class="block text-sm text-gray-400 mb-1">Platform</label>
                    <select id="task-platform" class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white">
                        <option value="YouTube">YouTube</option>
                        <option value="Telegram">Telegram</option>
                        <option value="Facebook">Facebook</option>
                        <option value="Instagram">Instagram</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm text-gray-400 mb-1">Task Type</label>
                    <select id="task-type" class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white">
                        <option value="Subscribe / Join">Subscribe / Join</option>
                        <option value="Like / React">Like / React</option>
                        <option value="Comment">Comment</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm text-gray-400 mb-1">Target Link</label>
                    <input type="url" id="task-link" required placeholder="https://..." class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white">
                </div>
                <div>
                    <label class="block text-sm text-gray-400 mb-1">Reward Points (Min: 5)</label>
                    <input type="number" id="task-reward" min="5" value="10" required class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white">
                </div>
                <button type="submit" class="w-full bg-green-600 hover:bg-green-700 font-semibold p-2 rounded transition">Create Task</button>
            </form>
        </div>

        <!-- 3. BUY POINTS TAB (Telegram Stars) -->
        <div id="tab-buy" class="tab-content space-y-4">
            <h2 class="text-xl font-bold mb-2"><i class="fa-solid fa-star text-yellow-400"></i> Buy Points (Telegram Stars)</h2>
            <div class="grid grid-cols-1 gap-4">
                <div class="bg-gray-800 p-4 rounded-xl border border-gray-700 flex justify-between items-center">
                    <div>
                        <h3 class="font-bold text-lg">100 Points</h3>
                        <p class="text-sm text-gray-400">Get 100 points for tasks</p>
                    </div>
                    <button onclick="buyPackage('small')" class="bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold px-4 py-2 rounded">5 Stars ⭐️</button>
                </div>
                <div class="bg-gray-800 p-4 rounded-xl border border-gray-700 flex justify-between items-center">
                    <div>
                        <h3 class="font-bold text-lg">500 Points</h3>
                        <p class="text-sm text-gray-400">Get 500 points for tasks</p>
                    </div>
                    <button onclick="buyPackage('medium')" class="bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold px-4 py-2 rounded">20 Stars ⭐️</button>
                </div>
                <div class="bg-gray-800 p-4 rounded-xl border border-gray-700 flex justify-between items-center">
                    <div>
                        <h3 class="font-bold text-lg">1200 Points</h3>
                        <p class="text-sm text-gray-400">Get 1200 points for tasks</p>
                    </div>
                    <button onclick="buyPackage('large')" class="bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold px-4 py-2 rounded">40 Stars ⭐️</button>
                </div>
            </div>
        </div>

        <!-- 4. PROFILE TAB (Daily Bonus, Referral & Password) -->
        <div id="tab-profile" class="tab-content space-y-4">
            <h2 class="text-xl font-bold mb-2"><i class="fa-solid fa-user text-purple-400"></i> User Profile</h2>
            
            <!-- Daily Bonus Card -->
            <div class="bg-gray-800 p-4 rounded-xl border border-gray-700 flex justify-between items-center">
                <div>
                    <h3 class="font-bold">Daily Bonus</h3>
                    <p class="text-sm text-gray-400">Claim 5 free points every 24 hours</p>
                </div>
                <button onclick="claimDailyBonus()" class="bg-purple-600 hover:bg-purple-700 font-semibold px-4 py-2 rounded text-sm">Claim</button>
            </div>

            <!-- Referral Card -->
            <div class="bg-gray-800 p-4 rounded-xl border border-gray-700 space-y-2">
                <h3 class="font-bold">Referral System</h3>
                <p class="text-sm text-gray-400">Invite friends and earn 30% Star commission from their purchases!</p>
                <div class="flex items-center space-x-2">
                    <input type="text" id="ref-link" readonly class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-sm text-gray-300">
                    <button onclick="copyRefLink()" class="bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded text-sm"><i class="fa-solid fa-copy"></i></button>
                </div>
            </div>

            <!-- Set / Change Website Password Card -->
            <div class="bg-gray-800 p-4 rounded-xl border border-gray-700 space-y-3">
                <h3 class="font-bold">Website Login Password</h3>
                <input type="password" id="web-password" placeholder="New Password" class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-sm text-white">
                <button onclick="setPassword()" class="w-full bg-blue-600 hover:bg-blue-700 font-semibold py-2 rounded text-sm">Save Password</button>
            </div>

            <!-- Withdraw Stars Section -->
            <div class="bg-gray-800 p-4 rounded-xl border border-gray-700 space-y-3">
                <h3 class="font-bold text-purple-400"><i class="fa-solid fa-wallet"></i> Withdraw Stars (Min: 500)</h3>
                <div>
                    <label class="block text-xs text-gray-400 mb-1">Method</label>
                    <select id="withdraw-method" class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-sm text-white">
                        <option value="bkash">bKash</option>
                        <option value="nagad">Nagad</option>
                        <option value="binance">Binance ID / USDT</option>
                    </select>
                </div>
                <div>
                    <label class="block text-xs text-gray-400 mb-1">Account Number / Details</label>
                    <input type="text" id="withdraw-account" placeholder="Enter account details" class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-sm text-white">
                </div>
                <div>
                    <label class="block text-xs text-gray-400 mb-1">Amount (Stars)</label>
                    <input type="number" id="withdraw-amount" min="500" placeholder="500" class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-sm text-white">
                </div>
                <button onclick="requestWithdraw()" class="w-full bg-purple-600 hover:bg-purple-700 font-semibold py-2 rounded text-sm">Submit Withdrawal</button>
            </div>

            <!-- Admin Panel Button (Hidden by default) -->
            <div id="admin-section" class="hidden bg-gray-800 p-4 rounded-xl border border-red-500 space-y-3">
                <h3 class="font-bold text-red-400"><i class="fa-solid fa-shield-halved"></i> Admin Panel</h3>
                <input type="text" id="admin-target-id" placeholder="Target Telegram ID" class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-sm text-white">
                <input type="number" id="admin-amount" placeholder="Points to give" class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-sm text-white">
                <button onclick="adminGiveCredit()" class="w-full bg-red-600 hover:bg-red-700 font-semibold py-2 rounded text-sm">Give Credit</button>
            </div>
        </div>

    </main>

    <!-- Bottom Navigation Bar -->
    <nav class="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 flex justify-around p-3 z-50">
        <button onclick="switchTab('earn')" class="nav-btn text-yellow-400 flex flex-col items-center" data-tab="earn">
            <i class="fa-solid fa-coins text-lg"></i>
            <span class="text-xs mt-1">Earn</span>
        </button>
        <button onclick="switchTab('create')" class="nav-btn text-gray-400 flex flex-col items-center" data-tab="create">
            <i class="fa-solid fa-plus-circle text-lg"></i>
            <span class="text-xs mt-1">Create</span>
        </button>
        <button onclick="switchTab('buy')" class="nav-btn text-gray-400 flex flex-col items-center" data-tab="buy">
            <i class="fa-solid fa-star text-lg"></i>
            <span class="text-xs mt-1">Buy Stars</span>
        </button>
        <button onclick="switchTab('profile')" class="nav-btn text-gray-400 flex flex-col items-center" data-tab="profile">
            <i class="fa-solid fa-user text-lg"></i>
            <span class="text-xs mt-1">Profile</span>
        </button>
    </nav>

    <!-- Frontend Script Logic -->
    <script>
        const tg = window.Telegram.WebApp;
        tg.expand();

        // ইউজার টেলিগ্রাম আইডি (টেস্ট করার জন্য ফলব্যাক আইডি রাখা হয়েছে, টেলিগ্রাম মিনি অ্যাপে রিয়েল আইডি নেবে)
        const user = tg.initDataUnsafe?.user;
        const telegramId = user ? user.id.toString() : "123456789"; 
        const startParam = tg.initDataUnsafe?.start_param || null; // রেফারেল প্যারামিটার

        const botUsername = "sub4subtetris_bot"; // আপনার টেলিগ্রাম বটের সঠিক ইউজারনেম
        const serverUrl = ""; // লোকাল হলে খালি অথবা আপনার ব্যাকএন্ড লাইভ সার্ভার URL দিন

        let currentUserData = null;

        // ট্যাব সুইচিং লজিক
        function switchTab(tabName) {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('text-yellow-400'));
            document.querySelectorAll('.nav-btn').forEach(el => el.classList.add('text-gray-400'));

            document.getElementById(`tab-${tabName}`).classList.add('active');
            const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
            activeBtn.classList.remove('text-gray-400');
            activeBtn.classList.add('text-yellow-400');

            if (tabName === 'earn') fetchTasks();
        }

        // ইউজার রেজিস্টার এবং ডাটা লোড করা
        async function initUser() {
            try {
                const response = await fetch(`${serverUrl}/api/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telegramId, referredBy: startParam })
                });
                const data = await response.json();
                if (data.success) {
                    currentUserData = data.user;
                    updateUI(currentUserData);
                }
            } catch (err) {
                console.error("Init error:", err);
            }
        }

        function updateUI(user) {
            document.getElementById('user-points').innerText = user.points || 0;
            document.getElementById('user-stars').innerText = user.stars || 0;

            // রেফারেল লিংক সেটআপ
            const refLink = `https://t.me/${botUsername}?start=${telegramId}`;
            document.getElementById('ref-link').value = refLink;

            // যদি অ্যাডমিন হয় তবে অ্যাডমিন প্যানেল দেখাবে
            if (user.isAdmin) {
                document.getElementById('admin-section').classList.remove('hidden');
            }
        }

        function copyRefLink() {
            const copyText = document.getElementById('ref-link');
            copyText.select();
            navigator.clipboard.writeText(copyText.value);
            alert("Referral link copied to clipboard!");
        }

        // টাস্ক লোড করা
        async function fetchTasks() {
            const container = document.getElementById('tasks-container');
            container.innerHTML = '<p class="text-gray-400 text-center py-6">Loading tasks...</p>';
            try {
                const res = await fetch(`${serverUrl}/api/tasks/${telegramId}`);
                const tasks = await res.json();

                if (tasks.length === 0) {
                    container.innerHTML = '<p class="text-gray-400 text-center py-6">No tasks available right now. Check back later!</p>';
                    return;
                }

                container.innerHTML = '';
                tasks.forEach(task => {
                    const div = document.createElement('div');
                    div.className = "bg-gray-800 p-4 rounded-xl border border-gray-700 flex flex-col space-y-2";
                    div.innerHTML = `
                        <div class="flex justify-between items-center">
                            <span class="bg-blue-900 text-blue-200 text-xs px-2 py-1 rounded font-semibold">${task.platform} - ${task.taskType}</span>
                            <span class="text-yellow-400 font-bold text-sm"><i class="fa-solid fa-coins"></i> +${task.reward} Points</span>
                        </div>
                        <a href="${task.link}" target="_blank" class="text-blue-400 text-sm truncate underline">${task.link}</a>
                        <div class="flex space-x-2 pt-2">
                            <button onclick="completeTask('${task._id}')" class="flex-1 bg-green-600 hover:bg-green-700 text-sm font-semibold py-1.5 rounded">Complete</button>
                            <button onclick="skipTask('${task._id}')" class="bg-gray-700 hover:bg-gray-600 text-sm px-4 py-1.5 rounded">Skip</button>
                        </div>
                    `;
                    container.appendChild(div);
                });
            } catch (err) {
                container.innerHTML = '<p class="text-red-400 text-center py-6">Failed to load tasks.</p>';
            }
        }

        // টাস্ক কমপ্লিট করা
        async function completeTask(taskId) {
            try {
                const res = await fetch(`${serverUrl}/api/tasks/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telegramId, taskId })
                });
                const data = await res.json();
                if (data.success) {
                    document.getElementById('user-points').innerText = data.points;
                    fetchTasks();
                }
            } catch (err) {
                console.error(err);
            }
        }

        // টাস্ক স্কিপ করা
        async function skipTask(taskId) {
            try {
                await fetch(`${serverUrl}/api/tasks/skip`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telegramId, taskId })
                });
                fetchTasks();
            } catch (err) {
                console.error(err);
            }
        }

        // টাস্ক ক্রিয়েট ফর্ম সাবমিট
        document.getElementById('create-task-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const platform = document.getElementById('task-platform').value;
            const taskType = document.getElementById('task-type').value;
            const link = document.getElementById('task-link').value;
            const reward = document.getElementById('task-reward').value;

            try {
                const res = await fetch(`${serverUrl}/api/tasks/create`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telegramId, platform, taskType, link, reward })
                });
                const data = await res.json();
                if (data.success) {
                    alert(data.message);
                    document.getElementById('task-link').value = '';
                    switchTab('earn');
                } else {
                    alert(data.error);
                }
            } catch (err) {
                console.error(err);
            }
        });

        // ডেইলি বোনাস क्লেইম
        async function claimDailyBonus() {
            try {
                const res = await fetch(`${serverUrl}/api/daily-bonus`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telegramId })
                });
                const data = await res.json();
                if (data.success) {
                    document.getElementById('user-points').innerText = data.newBalance;
                    alert("Successfully claimed 5 daily bonus points!");
                } else {
                    alert(data.error);
                }
            } catch (err) {
                console.error(err);
            }
        }

        // টেলিগ্রাম স্টার প্যাকেজ কেনা
        async function buyPackage(packageType) {
            try {
                const res = await fetch(`${serverUrl}/api/create-invoice`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telegramId, packageType })
                });
                const data = await res.json();
                if (data.success) {
                    tg.openInvoice(data.invoiceLink, (status) => {
                        if (status === 'paid') {
                            alert("Payment successful!");
                            initUser();
                        }
                    });
                }
            } catch (err) {
                console.error(err);
            }
        }

        // পাসওয়ার্ড সেট করা
        async function setPassword() {
            const password = document.getElementById('web-password').value;
            if (!password) return alert("Please enter a password!");
            try {
                const res = await fetch(`${serverUrl}/api/set-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telegramId, password })
                });
                const data = await res.json();
                if (data.success) alert(data.message);
            } catch (err) {
                console.error(err);
            }
        }

        // উইথড্র রিকোয়েস্ট সাবমিট
        async function requestWithdraw() {
            const method = document.getElementById('withdraw-method').value;
            const account = document.getElementById('withdraw-account').value;
            const amount = document.getElementById('withdraw-amount').value;

            if (!account || !amount) return alert("All fields are required!");

            try {
                const res = await fetch(`${serverUrl}/api/withdraw`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telegramId, method, account, amount })
                });
                const data = await res.json();
                if (data.success) {
                    alert(data.message);
                    initUser();
                } else {
                    alert(data.error);
                }
            } catch (err) {
                console.error(err);
            }
        }

        // এডমিন ক্রেডিট দেওয়া
        async function adminGiveCredit() {
            const targetTelegramId = document.getElementById('admin-target-id').value;
            const amount = document.getElementById('admin-amount').value;

            try {
                const res = await fetch(`${serverUrl}/api/admin/give-credit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ adminId: telegramId, targetTelegramId, amount })
                });
                const data = await res.json();
                if (data.success) {
                    alert(`Success! New balance of target user: ${data.newBalance}`);
                } else {
                    alert(data.error);
                }
            } catch (err) {
                console.error(err);
            }
        }

        // অ্যাপ লোড হওয়ার সাথে সাথে ইনিশিয়েট করা
        initUser();
        fetchTasks();
    </script>
</body>
</html>
