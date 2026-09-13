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

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const MONGO_URI = process.env.MONGO_URI || '';
const ADMIN_ID = process.env.ADMIN_ID || ''; 
const BOT_USERNAME = process.env.BOT_USERNAME || ''; 
const EMAIL_USER = process.env.EMAIL_USER || ''; 
const EMAIL_PASS = process.env.EMAIL_PASS || ''; 

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
  skippedTasks: { type: Array, default: [] }, 
  lastDailyBonus: { type: Date, default: null },
  lastTaskTime: { type: Date, default: null }
});
const User = mongoose.model('User', UserSchema);

const TaskSchema = new mongoose.Schema({
  creatorTelegramId: { type: String, index: true },
  platformType: String,
  socialLink: String,
  rewardPerTask: { type: Number, min: 10 }, 
  budgetBalance: { type: Number, default: 0 }, 
  status: { type: String, default: 'Active' },
  completedCount: { type: Number, default: 0 },
  completedUsers: { type: Array, default: [] }
});
const Task = mongoose.model('Task', TaskSchema);

// Safe Bot Initialization to prevent deploy crash
let bot = null;
if (BOT_TOKEN) {
  bot = new TelegramBot(BOT_TOKEN, { polling: false });
}

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

    const userParam = urlParams.get('user');
    if (userParam) {
      req.telegramUser = JSON.parse(userParam);
    }

    next();
  } catch (e) {
    return res.status(401).json({ error: "Authentication failed!" });
  }
}

app.get('/api/config', (req, res) => {
  res.json({
    adminId: ADMIN_ID,
    botUsername: BOT_USERNAME
  });
});

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
      budgetBalance: totalCost, 
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

    if (task.status === 'Paused' && task.budgetBalance < task.rewardPerTask) {
      return res.status(400).json({ success: false, message: "Cannot resume! Budget is empty. Please add more funds." });
    }

    task.status = task.status === 'Active' ? 'Paused' : 'Active';
    await task.save();
    res.json({ success: true, status: task.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET TASKS: filters out completed, skipped, or creator's own tasks and limits to max 2
app.get('/api/tasks', async (req, res) => {
  try {
    const { platform, telegramId } = req.query;
    let query = { status: 'Active' }; 
    if (platform && platform !== 'All') {
      query.platformType = { $regex: platform, $options: 'i' };
    }
    
    let user = null;
    if (telegramId) {
      user = await User.findOne({ telegramId: String(telegramId) });
    }

    let tasks = await Task.find(query);
    
    if (user) {
      tasks = tasks.filter(t => 
        t.creatorTelegramId !== String(telegramId) && 
        !t.completedUsers.includes(String(telegramId)) &&
        !(user.skippedTasks && user.skippedTasks.includes(String(t._id))) &&
        t.budgetBalance >= t.rewardPerTask 
      );
    } else {
      tasks = tasks.filter(t => t.budgetBalance >= t.rewardPerTask);
    }

    tasks = tasks.slice(0, 2); 
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SKIP TASK: adds to skipped tasks so it never appears again for this user
app.post('/api/skip-task', verifyTelegramAuth, async (req, res) => {
  try {
    const { telegramId, taskId } = req.body;
    if (!telegramId || !taskId) return res.status(400).json({ error: "Invalid data" });

    await User.findOneAndUpdate(
      { telegramId: String(telegramId) },
      { $addToSet: { skippedTasks: taskId } }
    );

    res.json({ success: true, message: "Task skipped successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// COMPLETE TASK: ensures task is processed once and pushed to completed list
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

    let task = await Task.findOne({ _id: taskId, status: 'Active' }).session(session);
    if (!task) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Task not found or inactive" });
    }

    if (task.budgetBalance < task.rewardPerTask) {
      await Task.findByIdAndUpdate(taskId, { status: 'Paused' }, { session });
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "This task's budget has ended!" });
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

    const newBudget = task.budgetBalance - task.rewardPerTask;
    const newStatus = newBudget < task.rewardPerTask ? 'Paused' : 'Active';

    const updatedTask = await Task.findOneAndUpdate(
      { _id: taskId, completedUsers: { $ne: String(telegramId) }, budgetBalance: { $gte: task.rewardPerTask } },
      { 
        $push: { completedUsers: String(telegramId) },
        $inc: { completedCount: 1 },
        $set: { budgetBalance: newBudget, status: newStatus }
      },
      { new: true, session }
    );

    if (!updatedTask) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Task completion failed or budget exhausted!" });
    }

    const finalUser = await User.findOneAndUpdate(
      { telegramId: String(telegramId) },
      { 
        $inc: { balance: task.rewardPerTask },
        $push: { completedTasks: taskId },
        $addToSet: { skippedTasks: taskId } 
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

// Secured Admin Reward Route
app.post('/api/admin/reward', verifyTelegramAuth, async (req, res) => {
  try {
    const requesterId = String(req.telegramUser?.id);
    if (requesterId !== String(ADMIN_ID)) {
      return res.status(403).json({ success: false, error: "Unauthorized: Admin access only!" });
    }

    const { targetUserId, amount, type } = req.body; 
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, error: "Invalid reward amount!" });
    }

    let updateField = type === 'starBalance' ? { $inc: { starBalance: numAmount } } : { $inc: { balance: numAmount } };
    
    let targetUser = await User.findOneAndUpdate(
      { telegramId: String(targetUserId) },
      updateField,
      { new: true }
    );

    if (!targetUser) {
      return res.status(404).json({ success: false, error: "Target user not found in database!" });
    }

    try {
      if (bot) {
        await bot.sendMessage(targetUserId, `🎁 Congratulations! Admin rewarded you with ${numAmount} ${type === 'starBalance' ? 'Stars' : 'Credits'}.`);
      }
    } catch(e) {}

    res.json({ success: true, message: `Successfully rewarded ${numAmount} to user ${targetUserId}!` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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

    if (bot && ADMIN_ID) {
      const adminMessage = `🚨 *New Withdraw Request!*\n\n👤 *User:* @${username || 'N/A'}\n🆔 *ID:* \`${telegramId}\`\n⭐ *Amount:* ${amount} Stars\n💳 *Method:* ${paymentMethod}\n📱 *Account:* \`${accountNo}\``;
      await bot.sendMessage(ADMIN_ID, adminMessage, { parse_mode: 'Markdown' });
    }

    res.status(200).json({ success: true, message: "Withdraw request submitted successfully!", starBalance: user.starBalance });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Failed to process withdraw request." });
  }
});

app.post('/api/send-invoice', verifyTelegramAuth, async (req, res) => {
  const { chatId, amount, telegramId } = req.body;
  try {
    if (!bot) return res.status(500).json({ success: false, error: "Bot not initialized" });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
