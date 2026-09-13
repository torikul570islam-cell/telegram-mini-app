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
      return
