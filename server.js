require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());
app.use(cors());

// ১. MongoDB কানেকশন ও স্কিমা
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Connected Successfully'))
.catch((err) => console.error('❌ MongoDB Connection Error:', err));

const UserSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  username: String,
  balance: { type: Number, default: 0 },         // ক্রেডিট ব্যালেন্স
  starBalance: { type: Number, default: 0 },     // স্টার ব্যালেন্স (মিনিমাম ৫০০ হলে বিকাশ/নগদে উইথড্র)
  referredBy: { type: String, default: null },
  completedTasks: { type: Array, default: [] }
});
const User = mongoose.model('User', UserSchema);

const TaskSchema = new mongoose.Schema({
  creatorTelegramId: String,
  platformType: String,
  socialLink: String,
  rewardPerTask: Number,
  completedCount: { type: Number, default: 0 },
  completedUsers: { type: Array, default: [] }
});
const Task = mongoose.model('Task', TaskSchema);

// ২. টেলিগ্রাম বট ইনিশিয়ালাইজ
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// ৩. Nodemailer জিমেইল ট্রান্সপোর্টার সেটআপ
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ৪. ইউজার রেজিস্ট্রেশন ও রেফারেল হ্যান্ডলিং এপিআই
app.post('/api/user', async (req, res) => {
  try {
    const { telegramId, username, referralId } = req.body;
    let user = await User.findOne({ telegramId });
    
    if (!user) {
      user = new User({ telegramId, username, balance: 0, starBalance: 0, referredBy: referralId || null });
      await user.save();
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ৫. নতুন টাস্ক বা সোশ্যাল লিংক ক্রিয়েট করার এপিআই
app.post('/api/create-task', async (req, res) => {
  try {
    const { telegramId, platformType, socialLink, rewardPerTask } = req.body;
    let user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: "User not found" });

    const newTask = new Task({
      creatorTelegramId: telegramId,
      platformType,
      socialLink,
      rewardPerTask: Number(rewardPerTask),
      completedCount: 0
    });
    await newTask.save();
    res.json({ success: true, message: "Task posted successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ৬. সমস্ত এভেলেবল টাস্ক দেখার এপিআই
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await Task.find();
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ৭. টাস্ক কমপ্লিট করে আর্নিং যোগ করার এপিআই
app.post('/api/complete-task', async (req, res) => {
  try {
    const { telegramId, taskId } = req.body;
    let user = await User.findOne({ telegramId });
    let task = await Task.findById(taskId);

    if (!user || !task) return res.status(404).json({ error: "User or Task not found" });
    if (task.completedUsers.includes(telegramId)) {
      return res.status(400).json({ success: false, message: "You have already completed this task!" });
    }

    user.balance += task.rewardPerTask;
    user.completedTasks.push(taskId);
    await user.save();

    task.completedCount += 1;
    task.completedUsers.push(telegramId);
    await task.save();

    res.json({ success: true, balance: user.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ৮. বিকাশ/নগদ উইথড্র রিকোয়েস্ট
app.post('/api/withdraw', async (req, res) => {
  const { telegramId, username, starAmount, paymentMethod, accountNo } = req.body;

  try {
    let user = await User.findOne({ telegramId });
    if (!user || user.starBalance < starAmount) {
      return res.status(400).json({ success: false, message: "Insufficient star balance!" });
    }

    if (starAmount < 500) {
      return res.status(400).json({ success: false, message: "Minimum withdraw limit is 500 Stars!" });
    }

    user.starBalance -= starAmount;
    await user.save();

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL,
      subject: `🚨 New Withdraw Request (${paymentMethod}) from @${username || 'User'}`,
      text: `User ID: ${telegramId}\nUsername: @${username}\nStars to Pay: ${starAmount}\nMethod: ${paymentMethod}\nAccount No: ${accountNo}\n\nদয়া করে ম্যানুয়ালি টাকা পাঠিয়ে দিন।`,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ success: true, message: "Withdraw request submitted successfully!", starBalance: user.starBalance });
  } catch (error) {
    console.error("Withdraw Error:", error);
    res.status(500).json({ success: false, error: "Failed to process withdraw request." });
  }
});

// ৯. টেলিগ্রাম স্টারস (XTR) পেমেন্ট ইনভয়েস
app.post('/api/send-invoice', async (req, res) => {
  const { chatId, amount, telegramId } = req.body;
  try {
    const prices = [{ label: 'Buy Credits/Stars', amount: amount || 100 }];
    await bot.sendInvoice(
      chatId,
      'Buy Package',
      'Purchase using Telegram Stars',
      `stars_payload_${telegramId}`,
      '',
      'XTR',
      prices
    );
    res.status(200).json({ success: true, message: "Invoice sent!" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

bot.on('pre_checkout_query', async (query) => {
  try {
    await bot.answerPreCheckoutQuery(query.id, true);
  } catch (error) {
    console.error("Pre-checkout Error:", error);
  }
});

bot.on('message', async (msg) => {
  if (msg.successful_payment) {
    const chatId = msg.chat.id;
    const totalStars = msg.successful_payment.total_amount; 
    await bot.sendMessage(chatId, `🎉 Payment of ${totalStars} Stars successful! Account updated.`);
  }
});

// ১০. Like4Like স্টাইল 3-Dot মেনু এবং ফুল ফ্রন্টএন্ড UI
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Social Exchange Mini App</title>
        <script src="https://telegram.org/js/telegram-web-app.js"></script>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #fff; margin: 0; padding: 15px; text-align: center; }
            .header { background: #1e293b; padding: 15px; border-radius: 12px; margin-bottom: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: flex; justify-content: space-between; align-items: center; }
            .header-info { text-align: left; }
            .balance { font-size: 16px; font-weight: bold; color: #38bdf8; }
            
            /* 3-Dot Menu Button */
            .menu-btn { background: #334155; color: #fff; border: none; font-size: 20px; padding: 8px 12px; border-radius: 8px; cursor: pointer; }
            
            /* Sliding Side Menu (Like4Like Style) */
            .side-menu { position: fixed; top: 0; right: -280px; width: 260px; height: 100%; background: #1e293b; box-shadow: -5px 0 15px rgba(0,0,0,0.5); z-index: 1000; transition: 0.3s ease; text-align: left; padding: 20px; box-sizing: border-box; }
            .side-menu.open { right: 0; }
            .menu-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 10px; margin-bottom: 15px; }
            .close-menu { background: #ef4444; color: #fff; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; }
            .menu-item { display: block; padding: 10px 12px; color: #cbd5e1; text-decoration: none; border-radius: 6px; margin-bottom: 5px; background: #0f172a; font-size: 14px; cursor: pointer; border: none; width: 100%; text-align: left; }
            .menu-item:hover { background: #334155; color: #38bdf8; }

            .card { background: #1e293b; padding: 15px; border-radius: 12px; margin-bottom: 12px; text-align: left; }
            button.action-btn { background: #38bdf8; color: #0f172a; border: none; padding: 10px; font-size: 14px; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%; margin-top: 5px; }
            input, select { width: 100%; padding: 10px; margin: 6px 0 12px 0; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: #fff; box-sizing: border-box; }
            .section-title { color: #38bdf8; margin-top: 20px; text-align: left; }
            .tab-content { display: none; }
            .tab-content.active { display: block; }
        </style>
    </head>
    <body>
        <!-- Header with Credits & 3-Dot Menu -->
        <div class="header">
            <div class="header-info">
                <h3 style="margin:0 0 5px 0; font-size:16px;">🔥 Social Exchange</h3>
                <span class="balance">🪙 <span id="userBalance">0</span> Credits</span> | <span style="color:#22c55e;">⭐ <span id="userStarBalance">0</span> Stars</span>
            </div>
            <button class="menu-btn" onclick="toggleMenu()">⋮</button>
        </div>

        <!-- Sliding 3-Dot Menu Options (Like4Like Style) -->
        <div id="sideMenu" class="side-menu">
            <div class="menu-header">
                <h4 style="margin:0; color:#38bdf8;">Menu Options</h4>
                <button class="close-menu" onclick="toggleMenu()">✕</button>
            </div>
            <button class="menu-item" onclick="switchTab('earn'); toggleMenu()">🎁 Free Credits / Earn</button>
            <button class="menu-item" onclick="switchTab('post'); toggleMenu()">➕ Add / Manage Pages</button>
            <button class="menu-item" onclick="switchTab('buy'); toggleMenu()">🛒 Buy Credits (Telegram Stars)</button>
            <button class="menu-item" onclick="switchTab('profile'); toggleMenu()">👤 Profile & Withdraw</button>
            <button class="menu-item" onclick="alert('Weekly Bonuses coming soon!')">🏆 Weekly Bonuses</button>
            <button class="menu-item" onclick="alert('Special Offers activated!')">📢 Special Offers</button>
        </div>

        <!-- 1. EARN / FREE CREDITS TAB -->
        <div id="earnTab" class="tab-content active">
            <h3 class="section-title" style="margin-top:0;">🎯 Free Credits (Available Tasks)</h3>
            <div id="taskList">Loading tasks...</div>
        </div>

        <!-- 2. ADD/MANAGE PAGES TAB -->
        <div id="postTab" class="tab-content">
            <div class="card">
                <h3 class="section-title" style="margin-top:0;">➕ Add Social Link & Promotion</h3>
                <label>Select Platform:</label>
                <select id="platformType">
                    <option value="Facebook Likes">Facebook Likes</option>
                    <option value="Facebook Follow">Facebook Follow</option>
                    <option value="Instagram Likes">Instagram Likes</option>
                    <option value="Instagram Followers">Instagram Followers</option>
                    <option value="TikTok Likes">TikTok Likes</option>
                    <option value="TikTok Followers">TikTok Followers</option>
                </select>
                <label>Social Link / URL:</label>
                <input type="text" id="socialLink" placeholder="https://facebook.com/your-page">
                <label>Credits Per Task (Reward):</label>
                <input type="number" id="rewardPerTask" placeholder="e.g. 5">
                <button class="action-btn" onclick="createTask()">Add Link & Start Promotion</button>
            </div>
        </div>

        <!-- 3. BUY CREDITS TAB -->
        <div id="buyTab" class="tab-content">
            <div class="card">
                <h3 class="section-title" style="margin-top:0;">🛒 Buy Credits with Telegram Stars</h3>
                <p style="font-size: 13px; color: #94a3b8;">Instantly boost your balance using official Telegram Stars (XTR).</p>
                <label>Select Package:</label>
                <select id="starPackage">
                    <option value="50">50 Stars - 500 Credits</option>
                    <option value="100">100 Stars - 1100 Credits</option>
                    <option value="250">250 Stars - 3000 Credits</option>
                </select>
                <button class="action-btn" style="background:#22c55e; color:#fff;" onclick="buyStarsInvoice()">Pay with Telegram Stars</button>
            </div>
        </div>

        <!-- 4. PROFILE & WITHDRAW TAB -->
        <div id="profileTab" class="tab-content">
            <div class="card">
                <h3 class="section-title" style="margin-top:0;">👤 My Profile</h3>
                <p><strong>Username:</strong> <span id="pUsername">-</span></p>
                <p><strong>User ID:</strong> <span id="pId">-</span></p>
                <p><strong>Credit Balance:</strong> <span id="pBalance" style="color:#38bdf8; font-weight:bold;">0</span></p>
                <p><strong>Star Balance:</strong> <span id="pStarBalance" style="color:#22c55e; font-weight:bold;">0</span> Stars (Min 500)</p>
                <p style="font-size: 12px; color: #94a3b8; margin-bottom: 4px;">Referral Link:</p>
                <input type="text" id="refLink" readonly style="font-size: 11px; background: #111;">
            </div>

            <div class="card">
                <h3 class="section-title" style="margin-top:0;">💳 Withdraw via Bkash/Nagad</h3>
                <label>Select Method:</label>
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
            const urlParams = new URLSearchParams(window.location.search);
            const referralId = urlParams.get('start') || null;

            function toggleMenu() {
                document.getElementById('sideMenu').classList.toggle('open');
            }

            function switchTab(tabName) {
                document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
                
                if(tabName === 'earn') {
                    document.getElementById('earnTab').classList.add('active');
                } else if(tabName === 'post') {
                    document.getElementById('postTab').classList.add('active');
                } else if(tabName === 'buy') {
                    document.getElementById('buyTab').classList.add('active');
                } else if(tabName === 'profile') {
                    document.getElementById('profileTab').classList.add('active');
                }
            }

            async function initApp() {
                const res = await fetch('/api/user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telegramId: String(user.id), username: user.username, referralId })
                });
                const currentUserData = await res.json();
                
                document.getElementById('userBalance').innerText = currentUserData.balance;
                document.getElementById('userStarBalance').innerText = currentUserData.starBalance;
                document.getElementById('pUsername').innerText = '@' + (user.username || 'user');
                document.getElementById('pId').innerText = user.id;
                document.getElementById('pBalance').innerText = currentUserData.balance;
                document.getElementById('pStarBalance').innerText = currentUserData.starBalance;
                
                const botUsername = "YourBotUsername"; 
                document.getElementById('refLink').value = \`https://t.me/\${botUsername}?start=\${user.id}\`;

                loadTasks();
            }

            async function createTask() {
                const platformType = document.getElementById('platformType').value;
                const socialLink = document.getElementById('socialLink').value;
                const rewardPerTask = document.getElementById('rewardPerTask').value;

                if(!socialLink || !rewardPerTask) {
                    alert("Please fill all fields!");
                    return;
                }

                const res = await fetch('/api/create-task', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telegramId: String(user.id), platformType, socialLink, rewardPerTask })
                });
                const data = await res.json();
                if(data.success) {
                    alert("Promotion added successfully!");
                    document.getElementById('socialLink').value = '';
                    document.getElementById('rewardPerTask').value = '';
                    switchTab('earn');
                    loadTasks();
                } else {
                    alert(data.error);
                }
            }

            async function loadTasks() {
                const res = await fetch('/api/tasks');
                const tasks = await res.json();
                const taskListDiv = document.getElementById('taskList');
                
                if(tasks.length === 0) {
                    taskListDiv.innerHTML = "<p style='color:#94a3b8;'>No tasks available right now.</p>";
                    return;
                }

                let html = '';
                tasks.forEach(task => {
                    html += \`
                        <div class="card" style="border: 1px solid #334155;">
                            <span style="font-size: 11px; background: #334155; padding: 2px 6px; border-radius: 4px; color: #38bdf8;">\${task.platformType}</span>
                            <p style="margin: 8px 0;"><strong>Link:</strong> <a href="\${task.socialLink}" target="_blank" style="color: #38bdf8; word-break:break-all;">\${task.socialLink}</a></p>
                            <p><strong>Reward:</strong> +\${task.rewardPerTask} Credits</p>
                            <p><strong>Completed:</strong> <span style="color: #22c55e; font-weight:bold;">\${task.completedCount}</span> times</p>
                            <button class="action-btn" onclick="completeTask('\${task._id}')">Complete Task & Earn</button>
                        </div>
                    \`;
                });
                taskListDiv.innerHTML = html;
            }

            async function completeTask(taskId) {
                const res = await fetch('/api/complete-task', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telegramId: String(user.id), taskId })
                });
                const data = await res.json();
                if(data.success) {
                    alert("Task completed successfully! Reward added.");
                    initApp();
                } else {
                    alert(data.message);
                }
            }

            async function buyStarsInvoice() {
                const amount = Number(document.getElementById('starPackage').value);
                const res = await fetch('/api/send-invoice', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chatId: user.id, amount, telegramId: user.id })
                });
                const data = await res.json();
                if(data.success) {
                    alert("Invoice sent to your Telegram chat! Please check your bot chat.");
                } else {
                    alert("Failed to send invoice.");
                }
            }

            async function requestWithdraw() {
                const paymentMethod = document.getElementById('paymentMethod').value;
                const accountNo = document.getElementById('accountNo').value;
                const starAmount = Number(document.getElementById('starAmount').value);

                if(!accountNo || !starAmount) {
                    alert("Please fill all fields!");
                    return;
                }

                const res = await fetch('/api/withdraw', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telegramId: String(user.id), username: user.username, starAmount, paymentMethod, accountNo })
                });
                const data = await res.json();
                if(data.success) {
                    alert("Withdraw request sent to Admin via Email!");
                    initApp();
                } else {
                    alert(data.message);
                }
            }

            initApp();
        </script>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
