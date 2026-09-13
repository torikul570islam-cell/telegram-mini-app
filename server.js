app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Sub4Sub Social Exchange</title>
        <script src="https://telegram.org/js/telegram-web-app.js"></script>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #fff; margin: 0; padding: 12px; text-align: center; }
            .header { background: #1e293b; padding: 12px 15px; border-radius: 12px; margin-bottom: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: flex; justify-content: space-between; align-items: center; }
            .header-info { text-align: left; }
            .balance { font-size: 14px; font-weight: bold; color: #38bdf8; }
            .menu-btn { background: #334155; color: #fff; border: none; font-size: 20px; padding: 6px 12px; border-radius: 8px; cursor: pointer; }
            
            .side-menu { position: fixed; top: 0; right: -280px; width: 260px; height: 100%; background: #1e293b; box-shadow: -5px 0 15px rgba(0,0,0,0.5); z-index: 1000; transition: 0.3s ease; text-align: left; padding: 20px; box-sizing: border-box; }
            .side-menu.open { right: 0; }
            .menu-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 10px; margin-bottom: 15px; }
            .close-menu { background: #ef4444; color: #fff; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; }
            .menu-item { display: block; padding: 10px 12px; color: #cbd5e1; text-decoration: none; border-radius: 6px; margin-bottom: 6px; background: #0f172a; font-size: 14px; cursor: pointer; border: none; width: 100%; text-align: left; }
            .menu-item:hover { background: #334155; color: #38bdf8; }

            .card { background: #1e293b; padding: 15px; border-radius: 12px; margin-bottom: 12px; text-align: left; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
            button.action-btn { background: #38bdf8; color: #0f172a; border: none; padding: 10px; font-size: 14px; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%; margin-top: 5px; }
            input, select { width: 100%; padding: 10px; margin: 6px 0 12px 0; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: #fff; box-sizing: border-box; font-size: 14px; }
            .section-title { color: #38bdf8; margin-top: 15px; text-align: left; font-size: 16px; }
            .tab-content { display: none; }
            .tab-content.active { display: block; }

            .cat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 15px; }
            .cat-btn { background: #1e293b; border: 1px solid #334155; color: #cbd5e1; padding: 10px; border-radius: 8px; font-size: 12px; cursor: pointer; text-align: center; font-weight: bold; }
            .cat-btn.active, .cat-btn:hover { background: #38bdf8; color: #0f172a; border-color: #38bdf8; }

            /* অ্যাড সেকশন একদম নিচে ফিক্সড রাখার জন্য স্টাইল */
            .ad-container {
                margin-top: 30px;
                margin-bottom: 20px;
                width: 100%;
                display: flex;
                justify-content: center;
                align-items: center;
                overflow: hidden;
            }
        </style>
    </head>
    <body onload="initApp()">
        <div class="header">
            <div class="header-info">
                <h3 style="margin:0 0 2px 0; font-size:15px;">🔥 Sub4Sub Exchange</h3>
                <span class="balance">🪙 <span id="userBalance">0</span> Crd</span> | <span style="color:#22c55e; font-size:13px;">⭐ <span id="userStarBalance">0</span> Str</span>
            </div>
            <button class="menu-btn" onclick="toggleMenu()">⋮</button>
        </div>

        <div id="sideMenu" class="side-menu">
            <div class="menu-header">
                <h4 style="margin:0; color:#38bdf8;">Main Menu</h4>
                <button class="close-menu" onclick="toggleMenu()">✕</button>
            </div>
            <button class="menu-item" onclick="switchTab('earn'); toggleMenu()">🎁 Free Credits / Earn</button>
            <button class="menu-item" onclick="switchTab('post'); toggleMenu()">➕ Add Page / Promotion</button>
            <button class="menu-item" onclick="switchTab('manage'); toggleMenu(); loadMyTasks();">⚙️ Manage My Pages</button>
            <button class="menu-item" onclick="switchTab('bonus'); toggleMenu()">🏆 Daily Free Bonus</button>
            <button class="menu-item" onclick="switchTab('buy'); toggleMenu()">🛒 Buy Credits (Stars)</button>
            <button class="menu-item" onclick="switchTab('profile'); toggleMenu()">👤 Profile & Withdraw</button>
        </div>

        <div id="earnTab" class="tab-content active">
            <h3 class="section-title" style="margin-top:0;">🎯 Select Category to Earn</h3>
            <div class="cat-grid">
                <button class="cat-btn active" onclick="filterTasks('All', this)">🌐 All Networks</button>
                <button class="cat-btn" onclick="filterTasks('YouTube', this)">▶️ YouTube Subs/Likes</button>
                <button class="cat-btn" onclick="filterTasks('Facebook', this)">📘 Facebook Likes/Follow</button>
                <button class="cat-btn" onclick="filterTasks('Instagram', this)">📸 Instagram Likes/Follow</button>
                <button class="cat-btn" onclick="filterTasks('TikTok', this)">🎵 TikTok Likes/Follow</button>
                <button class="cat-btn" onclick="filterTasks('Twitter', this)">🐦 X (Twitter) Follow</button>
            </div>
            
            <!-- টাস্ক লিস্ট বা নো টাস্ক মেসেজ (সব টাস্ক এর উপরে থাকবে) -->
            <div id="taskList">Loading tasks...</div>

            <!-- স্ট্যান্ডার্ড ব্যানার অ্যাড (320x50) - টাস্ক লিস্টের একদম নিচে থাকবে -->
            <div class="ad-container">
                <script type="text/javascript">
                  atOptions = {
                    'key' : '077dcfa37d090a49bc9753ac4a17d84a',
                    'format' : 'iframe',
                    'height' : 50,
                    'width' : 320,
                    'params' : {}
                  };
                </script>
                <script type="text/javascript" src="https://www.highrevenueformat.com/077dcfa37d090a49bc9753ac4a17d84a/invoke.js"></script>
            </div>
        </div>

        <div id="postTab" class="tab-content">
            <div class="card">
                <h3 class="section-title" style="margin-top:0;">➕ Add Social Link</h3>
                <label>Select Platform Type:</label>
                <select id="platformType">
                    <option value="YouTube Subscribe">YouTube Subscribe</option>
                    <option value="YouTube Video Like">YouTube Video Like</option>
                    <option value="Facebook Page Like">Facebook Page Like</option>
                    <option value="Facebook Post Like">Facebook Post Like</option>
                    <option value="Instagram Follower">Instagram Follower</option>
                    <option value="Instagram Post Like">Instagram Post Like</option>
                    <option value="TikTok Follower">TikTok Follower</option>
                    <option value="TikTok Video Like">TikTok Video Like</option>
                    <option value="Twitter/X Follower">Twitter/X Follower</option>
                </select>
                <label>Social Link / URL:</label>
                <input type="text" id="socialLink" placeholder="https://youtube.com/@yourchannel">
                <label>Credits Per Task Reward (Min 10):</label>
                <input type="number" id="rewardPerTask" min="10" placeholder="e.g. 10">
                <p style="font-size:11px; color:#94a3b8;">Note: 10x reward credits will be deducted instantly as minimum budget for 10 engagements.</p>
                <button class="action-btn" onclick="createTask()">Add Link & Start Promotion</button>
            </div>
        </div>

        <div id="manageTab" class="tab-content">
            <h3 class="section-title" style="margin-top:0;">⚙️ Manage Your Pages</h3>
            <div id="myTaskList">Loading your pages...</div>
        </div>

        <div id="bonusTab" class="tab-content">
            <div class="card" style="text-align: center;">
                <h3 class="section-title" style="margin-top:0; text-align: center;">🏆 Daily Free Bonus</h3>
                <p style="font-size: 13px; color: #94a3b8;">Claim your free 10 credits every 24 hours to promote your pages!</p>
                <button class="action-btn" style="background:#22c55e; color:#fff;" onclick="claimDailyBonus()">Claim Daily Bonus (+10 Crd)</button>
            </div>
        </div>

        <div id="buyTab" class="tab-content">
            <div class="card">
                <h3 class="section-title" style="margin-top:0;">🛒 Buy Credits with Telegram Stars</h3>
                <label>Select Package:</label>
                <select id="starPackage">
                    <option value="50">50 Stars - 500 Credits</option>
                    <option value="100">100 Stars - 1100 Credits</option>
                    <option value="250">250 Stars - 3000 Credits</option>
                </select>
                <button class="action-btn" style="background:#22c55e; color:#fff;" onclick="buyStarsInvoice()">Pay with Telegram Stars</button>
            </div>
        </div>

        <div id="profileTab" class="tab-content">
            <div class="card">
                <h3 class="section-title" style="margin-top:0;">👤 My Profile & Referrals</h3>
                <p><strong>Username:</strong> <span id="pUsername">-</span></p>
                <p><strong>User ID:</strong> <span id="pId">-</span></p>
                <p><strong>Credit Balance:</strong> <span id="pBalance" style="color:#38bdf8; font-weight:bold;">0</span></p>
                <p><strong>Star Balance:</strong> <span id="pStarBalance" style="color:#22c55e; font-weight:bold;">0</span> Stars</p>
                <p style="font-size: 12px; color: #94a3b8; margin-bottom: 4px;">Referral Link (Earn 20 Crd per join):</p>
                <input type="text" id="refLink" readonly style="font-size: 11px; background: #111;">
            </div>

            <div class="card">
                <h3 class="section-title" style="margin-top:0;">💳 Withdraw via Bkash/Nagad</h3>
                <label>Method:</label>
                <select id="paymentMethod">
                    <option value="Bkash">Bkash</option>
                    <option value="Nagad">Nagad</option>
                    <option value="Rocket">Rocket</option>
                </select>
                <label>Account Number:</label>
                <input type="text" id="accountNo" placeholder="01XXXXXXXXX">
                <label>Stars to Withdraw (Min 500):</label>
                <input type="number" id="starAmount" placeholder="e.g. 500">
                <button class="action-btn" style="background: #22c55e; color: #fff;" onclick="requestWithdraw()">Submit Withdraw</button>
            </div>
        </div>

        <script>
            const tg = window.Telegram.WebApp;
            tg.expand();

            const user = tg.initDataUnsafe?.user || { id: "test_user_123", username: "testuser" };
            const initData = tg.initData || "";
            const urlParams = new URLSearchParams(window.location.search);
            const referralId = urlParams.get('start') || null;
            let currentPlatform = 'All';

            async function secureFetch(url, options = {}) {
                options.headers = options.headers || {};
                options.headers['Content-Type'] = 'application/json';
                options.headers['x-telegram-init-data'] = initData;
                return fetch(url, options);
            }

            function toggleMenu() {
                document.getElementById('sideMenu').classList.toggle('open');
            }

            function switchTab(tabName) {
                document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
                document.getElementById(tabName + 'Tab').classList.add('active');
            }

            async function initApp() {
                try {
                    const res = await secureFetch('/api/user', {
                        method: 'POST',
                        body: JSON.stringify({ telegramId: String(user.id), username: user.username, referralId })
                    });
                    const data = await res.json();
                    
                    document.getElementById('userBalance').innerText = data.balance;
                    document.getElementById('userStarBalance').innerText = data.starBalance;
                    document.getElementById('pUsername').innerText = '@' + (user.username || 'user');
                    document.getElementById('pId').innerText = user.id;
                    document.getElementById('pBalance').innerText = data.balance;
                    document.getElementById('pStarBalance').innerText = data.starBalance;
                    
                    const botUsername = "${BOT_USERNAME}"; 
                    document.getElementById('refLink').value = 'https://t.me/' + botUsername + '?start=' + user.id;

                    loadTasks(currentPlatform);
                } catch(err) {
                    console.error("Init Error:", err);
                }
            }

            function filterTasks(platform, btnElement) {
                currentPlatform = platform;
                document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
                btnElement.classList.add('active');
                loadTasks(platform);
            }

            async function createTask() {
                const platformType = document.getElementById('platformType').value;
                const socialLink = document.getElementById('socialLink').value;
                const rewardPerTask = document.getElementById('rewardPerTask').value;

                if(!socialLink || !rewardPerTask || Number(rewardPerTask) < 10) {
                    alert("Please fill all fields! Minimum reward per task must be at least 10 credits.");
                    return;
                }

                const res = await secureFetch('/api/create-task', {
                    method: 'POST',
                    body: JSON.stringify({ telegramId: String(user.id), platformType, socialLink, rewardPerTask })
                });
                const data = await res.json();
                if(data.success) {
                    alert("Promotion added successfully!");
                    document.getElementById('socialLink').value = '';
                    document.getElementById('rewardPerTask').value = '';
                    initApp();
                    switchTab('earn');
                } else {
                    alert(data.message || data.error);
                }
            }

            async function loadTasks(platform = 'All') {
                const res = await fetch('/api/tasks?platform=' + encodeURIComponent(platform) + '&telegramId=' + user.id);
                const tasks = await res.json();
                const taskListDiv = document.getElementById('taskList');
                
                if(tasks.length === 0) {
                    taskListDiv.innerHTML = "<p style='color:#94a3b8; text-align:center; padding: 20px;'>No tasks available for this category right now.</p>";
                    return;
                }

                let html = '';
                tasks.forEach(task => {
                    html += \`
                        <div class="card" style="border: 1px solid #334155;">
                            <span style="font-size: 11px; background: #334155; padding: 3px 8px; border-radius: 4px; color: #38bdf8; font-weight:bold;">\${task.platformType}</span>
                            <p style="margin: 8px 0; font-size: 13px;"><strong>Link:</strong> <a href="\${task.socialLink}" target="_blank" style="color: #38bdf8; word-break:break-all;">\${task.socialLink}</a></p>
                            <p style="margin: 0 0 10px 0; font-size: 13px;"><strong>Reward:</strong> +\${task.rewardPerTask} Credits</p>
                            <button class="action-btn" onclick="completeTask('\${task._id}', '\${task.socialLink}')">Visit & Earn Credits</button>
                        </div>
                    \`;
                });
                taskListDiv.innerHTML = html;
            }

            async function loadMyTasks() {
                const res = await fetch('/api/my-tasks/' + user.id);
                const tasks = await res.json();
                const myTaskListDiv = document.getElementById('myTaskList');

                if(tasks.length === 0) {
                    myTaskListDiv.innerHTML = "<p style='color:#94a3b8;'>You haven't added any pages yet.</p>";
                    return;
                }

                let html = '';
                tasks.forEach(task => {
                    html += \`
                        <div class="card" style="border: 1px solid #334155;">
                            <span style="font-size: 11px; background: #334155; padding: 3px 8px; border-radius: 4px; color: #38bdf8; font-weight:bold;">\${task.platformType}</span>
                            <p style="margin: 8px 0; word-break:break-all; font-size:13px;">\${task.socialLink}</p>
                            <p style="font-size: 13px;"><strong>Status:</strong> <span style="color:\${task.status==='Active'?'#22c55e':'#ef4444'}">\${task.status}</span> | <strong>Completed:</strong> \${task.completedCount} times</p>
                            <button class="action-btn" style="background:\${task.status==='Active'?'#ef4444':'#22c55e'}; color:#fff;" onclick="toggleTask('\${task._id}')">\${task.status==='Active'?'Pause Campaign':'Resume Campaign'}</button>
                        </div>
                    \`;
                });
                myTaskListDiv.innerHTML = html;
            }

            async function toggleTask(taskId) {
                await secureFetch('/api/toggle-task', {
                    method: 'POST',
                    body: JSON.stringify({ taskId, telegramId: String(user.id) })
                });
                loadMyTasks();
            }

            async function completeTask(taskId, socialLink) {
                window.open(socialLink, '_blank');

                const res = await secureFetch('/api/complete-task', {
                    method: 'POST',
                    body: JSON.stringify({ telegramId: String(user.id), taskId })
                });
                const data = await res.json();
                if(data.success) {
                    alert("Task completed successfully! Credits added.");
                    initApp();
                } else {
                    alert(data.message || data.error);
                }
            }

            async function claimDailyBonus() {
                const res = await secureFetch('/api/daily-bonus', {
                    method: 'POST',
                    body: JSON.stringify({ telegramId: String(user.id) })
                });
                const data = await res.json();
                alert(data.message || data.error);
                if(data.success) { initApp(); }
            }

            async function buyStarsInvoice() {
                const amount = document.getElementById('starPackage').value;
                const res = await secureFetch('/api/send-invoice', {
                    method: 'POST',
                    body: JSON.stringify({ chatId: user.id, amount, telegramId: user.id })
                });
                const data = await res.json();
                if(data.success) {
                    alert("Invoice generated! Check bot chat to complete payment with Telegram Stars.");
                } else {
                    alert(data.error);
                }
            }

            async function requestWithdraw() {
                const paymentMethod = document.getElementById('paymentMethod').value;
                const accountNo = document.getElementById('accountNo').value;
                const starAmount = document.getElementById('starAmount').value;

                if(!accountNo || !starAmount) {
                    alert("Please fill in all withdraw fields!");
                    return;
                }

                const res = await secureFetch('/api/withdraw', {
                    method: 'POST',
                    body: JSON.stringify({ 
                        telegramId: String(user.id), 
                        username: user.username, 
                        starAmount, 
                        paymentMethod, 
                        accountNo 
                    })
                });
                const data = await res.json();
                alert(data.message || data.error);
                if(data.success) { initApp(); }
            }
        </script>
    </body>
    </html>
  `);
});
