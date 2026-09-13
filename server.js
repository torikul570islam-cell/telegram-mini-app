const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_ID = process.env.ADMIN_ID; 
const BOT_USERNAME = process.env.BOT_USERNAME; 
const EMAIL_USER = process.env.EMAIL_USER; 
const EMAIL_PASS = process.env.EMAIL_PASS; 

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  message: { error: "Too many requests from this IP, please try again later." }
});
app.use('/api/', apiLimiter);

mongoose.connect(MONGO_URI)
.then(() => console.log('✅ MongoDB Connected Successfully'))
.catch((err) => console.error('❌ MongoDB Connection Error:', err));

const UserSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true, index: true },
  username: String,
  balance: { type: Number, default: 20, min: 0 },         
  starBalance: { type: Number, default: 0, min: 0 },     
  referredBy: { type: String, default: null },
  completedTasks: { type: Array, default: [] },
  lastDailyBonus: { type: Date, default: null },
  lastTaskTime: { type: Date, default: null }
});
const User = mongoose.model('User', UserSchema);

const TaskSchema = new mongoose.Schema({
  creatorTelegramId: { type: String, index: true },
  platformType: String,
  socialLink: String,
  rewardPerTask: { type: Number, min: 10 }, 
  status: { type: String, default: 'Active' },
  completedCount: { type: Number, default: 0 },
  completedUsers: { type: Array, default: [] }
});
const Task = mongoose.model('Task', TaskSchema);

const bot = new TelegramBot(BOT_TOKEN);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

function verifyTelegramAuth(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  if (!initData) {
    return res.status(401).json({ error: "Unauthorized: No Telegram WebApp init-data provided!" });
  }

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${key}=${val}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) {
      return res.status(401).json({ error: "Unauthorized: Telegram WebApp hash verification failed!" });
    }
    next();
  } catch (e) {
    return res.status(401).json({ error: "Authentication failed!" });
  }
}

app.post('/api/user', verifyTelegramAuth, async (req, res) => {
  try {
    const { telegramId, username, referralId } = req.body;
    if (!telegramId) return res.status(400).json({ error: "Invalid Telegram ID" });

    let user = await User.findOne({ telegramId: String(telegramId) });
    
    if (!user) {
      const validReferral = (referralId && referralId !== String(telegramId)) ? referralId : null;

      user = new User({ 
        telegramId: String(telegramId), 
        username: username || 'Unknown', 
        balance: 20, 
        referredBy: validReferral 
      });
      await user.save();

      if (validReferral) {
        let referrer = await User.findOne({ telegramId: validReferral });
        if (referrer) {
          referrer.balance += 100; 
          await referrer.save();
        }
      }
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/create-task', verifyTelegramAuth, async (req, res) => {
  try {
    const { telegramId, platformType, socialLink, rewardPerTask } = req.body;
    if (!telegramId || !socialLink) return res.status(400).json({ error: "Invalid data" });

    let user = await User.findOne({ telegramId: String(telegramId) });
    if (!user) return res.status(404).json({ error: "User not found" });

    const reward = Number(rewardPerTask);
    if (isNaN(reward) || reward < 10) {
      return res.status(400).json({ success: false, message: "Minimum reward per task must be at least 10 credits!" });
    }

    const totalCost = reward * 10; 
    if (user.balance < totalCost) {
      return res.status(400).json({ success: false, message: "Insufficient credit balance to launch promotion! (Min 10 tasks budget required)" });
    }

    const updatedUser = await User.findOneAndUpdate(
      { telegramId: String(telegramId), balance: { $gte: totalCost } },
      { $inc: { balance: -totalCost } },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(400).json({ success: false, message: "Transaction failed due to insufficient balance." });
    }

    const newTask = new Task({
      creatorTelegramId: String(telegramId),
      platformType,
      socialLink,
      rewardPerTask: reward,
      status: 'Active',
      completedCount: 0
    });
    await newTask.save();
    res.json({ success: true, message: "Promotion added successfully!", balance: updatedUser.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/my-tasks/:telegramId', async (req, res) => {
  try {
    const tasks = await Task.find({ creatorTelegramId: String(req.params.telegramId) });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/toggle-task', verifyTelegramAuth, async (req, res) => {
  try {
    const { taskId, telegramId } = req.body;
    let task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ error: "Task not found" });

    if (task.creatorTelegramId !== String(telegramId)) {
      return res.status(403).json({ error: "Unauthorized action" });
    }

    task.status = task.status === 'Active' ? 'Paused' : 'Active';
    await task.save();
    res.json({ success: true, status: task.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tasks', async (req, res) => {
  try {
    const { platform, telegramId } = req.query;
    let query = { status: 'Active' };
    if (platform && platform !== 'All') {
      query.platformType = { $regex: platform, $options: 'i' };
    }
    let tasks = await Task.find(query);
    
    if (telegramId) {
      tasks = tasks.filter(t => t.creatorTelegramId !== String(telegramId));
    }

    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/complete-task', verifyTelegramAuth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { telegramId, taskId } = req.body;
    if (!telegramId || !taskId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: "Invalid data" });
    }

    const now = new Date();
    const fiveSecondsAgo = new Date(now.getTime() - 5000);

    let user = await User.findOneAndUpdate(
      { 
        telegramId: String(telegramId), 
        $or: [
          { lastTaskTime: { $exists: false } }, 
          { lastTaskTime: null }, 
          { lastTaskTime: { $lte: fiveSecondsAgo } }
        ] 
      },
      { $set: { lastTaskTime: now } },
      { new: true, session }
    );

    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "You are completing tasks too fast! Please wait at least 5 seconds." });
    }

    let task = await Task.findOne({ _id: taskId, status: 'Active' }).session(session);
    if (!task) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Task not found or inactive" });
    }
    
    if (task.creatorTelegramId === String(telegramId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "You cannot complete your own task!" });
    }

    if (task.completedUsers.includes(String(telegramId))) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "You have already completed this task!" });
    }

    const updatedTask = await Task.findOneAndUpdate(
      { _id: taskId, completedUsers: { $ne: String(telegramId) } },
      { 
        $push: { completedUsers: String(telegramId) },
        $inc: { completedCount: 1 }
      },
      { new: true, session }
    );

    if (!updatedTask) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Task completion failed or already processed!" });
    }

    const finalUser = await User.findOneAndUpdate(
      { telegramId: String(telegramId) },
      { 
        $inc: { balance: task.rewardPerTask },
        $push: { completedTasks: taskId }
      },
      { new: true, session }
    );

    await session.commitTransaction();
    session.endSession();

    res.json({ success: true, balance: finalUser.balance });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/daily-bonus', verifyTelegramAuth, async (req, res) => {
  try {
    const { telegramId } = req.body;
    let user = await User.findOne({ telegramId: String(telegramId) });
    if (!user) return res.status(404).json({ error: "User not found" });

    const now = new Date();
    if (user.lastDailyBonus) {
      const diffTime = now - new Date(user.lastDailyBonus);
      const diffHours = diffTime / (1000 * 60 * 60);
      if (diffHours < 24) {
        const remainingHours = Math.ceil(24 - diffHours);
        return res.status(400).json({ success: false, message: `You can claim daily bonus after ${remainingHours} hours!` });
      }
    }

    user.balance += 10; 
    user.lastDailyBonus = now;
    await user.save();

    res.json({ success: true, message: "Successfully claimed 10 Daily Bonus credits!", balance: user.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/withdraw', verifyTelegramAuth, async (req, res) => {
  const { telegramId, username, starAmount, paymentMethod, accountNo } = req.body;

  try {
    const amount = Number(starAmount);
    if (isNaN(amount) || amount < 500) {
      return res.status(400).json({ success: false, message: "Minimum withdraw limit is 500 Stars!" });
    }

    const user = await User.findOneAndUpdate(
      { telegramId: String(telegramId), starBalance: { $gte: amount } },
      { $inc: { starBalance: -amount } },
      { new: true }
    );

    if (!user) {
      return res.status(400).json({ success: false, message: "Insufficient star balance or invalid user!" });
    }

    try {
      const mailOptions = {
        from: EMAIL_USER,
        to: EMAIL_USER,
        subject: `🚨 New Withdraw Request (${paymentMethod})`,
        text: `User ID: ${telegramId}\nUsername: @${username}\nStars to Pay: ${amount}\nMethod: ${paymentMethod}\nAccount No: ${accountNo}`,
      };
      await transporter.sendMail(mailOptions);
    } catch(e) { console.log("Email error:", e); }

    const adminMessage = `🚨 *New Withdraw Request!*\n\n👤 *User:* @${username || 'N/A'}\n🆔 *ID:* \`${telegramId}\`\n⭐ *Amount:* ${amount} Stars\n💳 *Method:* ${paymentMethod}\n📱 *Account:* \`${accountNo}\``;
    await bot.sendMessage(ADMIN_ID, adminMessage, { parse_mode: 'Markdown' });

    res.status(200).json({ success: true, message: "Withdraw request submitted successfully!", starBalance: user.starBalance });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Failed to process withdraw request." });
  }
});

app.post('/api/send-invoice', verifyTelegramAuth, async (req, res) => {
  const { chatId, amount, telegramId } = req.body;
  try {
    const prices = [{ label: 'Buy Credits/Stars', amount: Number(amount) || 100 }];
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
    let user = await User.findOneAndUpdate(
      { telegramId: String(chatId) },
      { $inc: { starBalance: totalStars } },
      { new: true }
    );
    if (user) {
      await bot.sendMessage(chatId, `🎉 Payment of ${totalStars} Stars successful! Star balance updated.`);
    }
  }
});

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
            .header { background: #1e293b; padding: 12px 15px; border-radius: 12px; margin-bottom: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 100; }
            .header-info { text-align: left; }
            .balance { font-size: 14px; font-weight: bold; color: #38bdf8; }
            .menu-btn { background: #334155; color: #fff; border: none; font-size: 20px; padding: 6px 12px; border-radius: 8px; cursor: pointer; }
            
            .side-menu { position: fixed; top: 0; right: -280px; width: 260px; height: 100%; background: #1e293b; box-shadow: -5px 0 25px rgba(0,0,0,0.8); z-index: 9999; transition: 0.3s ease; text-align: left; padding: 20px; box-sizing: border-box; }
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

            .ad-container {
                margin-top: 20px;
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
                <button class="cat-btn" onclick="filterTasks('YouTube', this)">▶️ YouTube</button>
                <button class="cat-btn" onclick="filterTasks('Telegram', this)">📢 Telegram</button>
                <button class="cat-btn" onclick="filterTasks('Facebook', this)">📘 Facebook</button>
                <button class="cat-btn" onclick="filterTasks('Instagram', this)">📸 Instagram</button>
                <button class="cat-btn" onclick="filterTasks('Website', this)">🌐 Website Visit</button>
            </div>
            
            <div id="taskList">Loading tasks...</div>

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
                    <option value="YouTube Video Watch">YouTube Video Watch</option>
                    <option value="Telegram Channel Join">Telegram Channel Join</option>
                    <option value="Telegram Group Join">Telegram Group Join</option>
                    <option value="Telegram Post View">Telegram Post View</option>
                    <option value="Facebook Page Like">Facebook Page Like</option>
                    <option value="Facebook Post Like">Facebook Post Like</option>
                    <option value="Instagram Follower">Instagram Follower</option>
                    <option value="Instagram Post Like">Instagram Post Like</option>
                    <option value="TikTok Follower">TikTok Follower</option>
                    <option value="TikTok Video Like">TikTok Video Like</option>
                    <option value="Twitter/X Follower">Twitter/X Follower</option>
                    <option value="Website Visit">🌐 Website Visit / Traffic</option>
                    <option value="App Download">📱 App Download & Review</option>
                    <option value="Facebook Share">↗️ Facebook Post Share</option>
                    <option value="Discord Join">💬 Discord Server Join</option>
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
                <p style="font-size: 12px; color: #94a3b8; margin-bottom: 4px;">Referral Link (Earn 100 Crd per join):</p>
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
                if(data.success) {
                    alert(data.message);
                    initApp();
                } else {
                    alert(data.message || data.error);
                }
            }

            async function buyStarsInvoice() {
                const amount = document.getElementById('starPackage').value;
                const res = await secureFetch('/api/send-invoice', {
                    method: 'POST',
                    body: JSON.stringify({ chatId: user.id, amount, telegramId: user.id })
                });
                const data = await res.json();
                if(data.success) {
                    alert("Invoice generated in your Telegram chat. Please check your bot chat to pay with Stars!");
                } else {
                    alert(data.error || "Failed to create invoice.");
                }
            }

            async function requestWithdraw() {
                const paymentMethod = document.getElementById('paymentMethod').value;
                const accountNo = document.getElementById('accountNo').value;
                const starAmount = document.getElementById('starAmount').value;

                if(!accountNo || !starAmount) {
                    alert("Please fill in all withdrawal fields!");
                    return;
                }

                const res = await secureFetch('/api/withdraw', {
                    method: 'POST',
                    body: JSON.stringify({ telegramId: String(user.id), username: user.username, starAmount, paymentMethod, accountNo })
                });
                const data = await res.json();
                if(data.success) {
                    alert(data.message);
                    document.getElementById('accountNo').value = '';
                    document.getElementById('starAmount').value = '';
                    initApp();
                } else {
                    alert(data.message || data.error);
                }
            }
        </script>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
