const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const TelegramBot = require('node-telegram-bot-api');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// All Hardcoded Credentials
const CONFIG = {
  MONGODB_URI: "mongodb+srv://torikul570:Nadira1432@cluster0.m5iatns.mongodb.net/telegram_app?retryWrites=true&w=majority&appName=Cluster0",
  TELEGRAM_BOT_TOKEN: "8801531798:AAEw7SJhnT1T8x69caPgMncjI6IPBAgWN3Q",
  EMAIL_USER: "torikul570islam@gmail.com",
  EMAIL_PASS: "zkqrkaxycksuksbr"
};

// Middleware
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

// MongoDB Connection
mongoose.connect(CONFIG.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB successfully!'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  username: { type: String },
  points: { type: Number, default: 100 },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// Task Schema
const taskSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  platform: { type: String, required: true },
  taskType: { type: String, required: true },
  link: { type: String, required: true },
  reward: { type: Number, required: true },
  status: { type: String, default: 'active' },
  createdAt: { type: Date, default: Date.now }
});
const Task = mongoose.model('Task', taskSchema);

// History Schema
const historySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  taskId: { type: String, required: true },
  earnedPoints: { type: Number, required: true },
  completedAt: { type: Date, default: Date.now }
});
const History = mongoose.model('History', historySchema);

// Telegram Bot Setup
const bot = new TelegramBot(CONFIG.TELEGRAM_BOT_TOKEN, { polling: true });

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  const username = msg.from.username || msg.from.first_name;

  try {
    let user = await User.findOne({ telegramId });
    if (!user) {
      user = new User({ telegramId, username, points: 100 });
      await user.save();
    }

    bot.sendMessage(chatId, `🔥 Welcome to Like4Like Bot, ${username}!\n\nEarn free points or buy VIP Points using Telegram Stars 🌟`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 Open Mini App', web_app: { url: 'https://your-frontend-url.com' } }],
          [{ text: '⭐ Buy Points with Stars', callback_data: 'buy_stars' }],
          [{ text: '💰 My Balance', callback_data: 'check_balance' }]
        ]
      }
    });
  } catch (err) {
    console.error('Bot start error:', err);
  }
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const telegramId = query.from.id.toString();

  if (query.data === 'check_balance') {
    const user = await User.findOne({ telegramId });
    const points = user ? user.points : 0;
    bot.answerCallbackQuery(query.id, { text: `Your balance is: ${points} Points` });
  } 
  else if (query.data === 'buy_stars') {
    // Telegram Stars Invoice Send করার কোড
    // XTR হলো Telegram Stars কারেন্সি কোড
    const prices = [{ label: '1000 Points Pack', amount: 50 }]; // 50 Telegram Stars
    bot.sendInvoice(
      chatId,
      'Boost Points (1000 Points)',
      'Get 1000 points instantly to promote your links using Telegram Stars.',
      'points_payload_1000',
      '', // Telegram Star পেমেন্টের জন্য Provider Token খালি রাখতে হয়
      'XTR', 
      prices
    );
  }
});

// Telegram Stars পেমেন্ট সাকসেস হ্যান্ডেল করার জন্য
bot.on('pre_checkout_query', (query) => {
  bot.answerPreCheckoutQuery(query.id, true).catch(console.error);
});

bot.on('successful_payment', async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  const payment = msg.successful_payment;

  if (payment.invoice_payload === 'points_payload_1000') {
    let user = await User.findOne({ telegramId });
    if (user) {
      user.points += 1000;
      await user.save();
      bot.sendMessage(chatId, `🎉 Payment Successful! 1000 points added to your account. New Balance: ${user.points}`);
    }
  }
});

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: CONFIG.EMAIL_USER,
    pass: CONFIG.EMAIL_PASS
  }
});

// --- API ROUTES ---

app.get('/api/user/:telegramId', async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: req.params.telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/tasks/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const tasks = await Task.find({ status: 'active', userId: { $ne: telegramId } }).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const { telegramId, platform, taskType, link, reward } = req.body;
    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.points < reward) {
      return res.status(400).json({ error: 'Insufficient points!' });
    }

    user.points -= reward;
    await user.save();

    const newTask = new Task({ userId: telegramId, platform, taskType, link, reward });
    await newTask.save();

    await transporter.sendMail({
      from: CONFIG.EMAIL_USER,
      to: CONFIG.EMAIL_USER,
      subject: '🔥 Like4Like: New Task Created!',
      text: `User ID: ${telegramId}\nPlatform: ${platform}\nType: ${taskType}\nLink: ${link}\nCost: ${reward} points.`
    });

    res.status(201).json({ message: 'Task created successfully!', task: newTask, remainingPoints: user.points });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/tasks/complete', async (req, res) => {
  try {
    const { telegramId, taskId } = req.body;
    const task = await Task.findById(taskId);
    if (!task || task.status !== 'active') {
      return res.status(400).json({ error: 'Task unavailable.' });
    }

    const worker = await User.findOne({ telegramId });
    if (!worker) return res.status(404).json({ error: 'User not found' });

    worker.points += task.reward;
    await worker.save();

    const history = new History({ userId: telegramId, taskId, earnedPoints: task.reward });
    await history.save();

    task.status = 'completed';
    await task.save();

    res.json({ message: `Successfully earned ${task.reward} points!`, newBalance: worker.points });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
