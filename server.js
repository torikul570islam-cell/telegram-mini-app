const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1); // রেট লিমিটারের প্রক্সি ইরর দূর করার জন্য
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
      return res.status(400).json({ success: false, message: "Insufficient balance!" });
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
    
    res.json({ success: true, message: "Task created successfully!", balance: updatedUser.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/task/:taskId', verifyTelegramAuth, async (req, res) => {
  try {
    const { taskId } = req.params;
    const telegramId = req.telegramUser?.id || req.body.telegramId;

    let task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ success: false, message: "Task not found" });

    if (task.creatorTelegramId !== String(telegramId)) {
      return res.status(403).json({ success: false, message: "Unauthorized to delete this task" });
    }

    await Task.findByIdAndDelete(taskId);
    res.json({ success: true, message: "Task deleted successfully" });
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

app.get('/api/tasks', async (req, res) => {
  try {
    const { platform, telegramId } = req.query;
    let query = { status: 'Active' };
    if (platform && platform !== 'All') {
      query.platformType = { $regex: platform, $options: 'i' };
    }
    
    let tasks = await Task.find(query);
    if (telegramId) {
      tasks = tasks.filter(t => t.creatorTelegramId !== String(telegramId) && !t.completedUsers.includes(String(telegramId)));
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

    let task = await Task.findOne({ _id: taskId, status: 'Active' }).session(session);
    if (!task) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Task not found or already completed" });
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
      return res.status(400).json({ success: false, message: "Task completion failed!" });
    }

    const updatedUser = await User.findOneAndUpdate(
      { telegramId: String(telegramId) },
      { 
        $inc: { balance: task.rewardPerTask },
        $push: { completedTasks: taskId } 
      },
      { new: true, session }
    );

    await session.commitTransaction();
    session.endSession();

    res.json({ success: true, balance: updatedUser.balance });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
