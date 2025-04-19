const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
// 使用环境变量PORT，如果没有则使用3000
const port = process.env.PORT || 3000;

// 中间件
app.use(cors({
    origin: ['https://songpengju.github.io', 'http://localhost:8000'],
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS', 'PUT'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json());

// 日志中间件
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// MongoDB连接
const connectWithRetry = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 30000
        });
        console.log('MongoDB连接成功');
    } catch (error) {
        console.error('MongoDB连接失败，5秒后重试:', error);
        setTimeout(connectWithRetry, 5000);
    }
};

connectWithRetry();

// 照片模型
const Photo = mongoose.model('Photo', {
    title: String,
    description: String,
    date: Date,
    imageUrl: String
});

// 信件模型
const Letter = mongoose.model('Letter', {
    title: String,
    content: String,
    date: { type: Date, default: Date.now },
    signature: String
});

// 确保上传目录存在
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    console.log('创建上传目录');
    fs.mkdirSync(uploadsDir);
}

// 配置文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        console.log('文件上传目标目录:', uploadsDir);
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const filename = Date.now() + path.extname(file.originalname);
        console.log('生成的文件名:', filename);
        cb(null, filename);
    }
});

const upload = multer({ storage: storage });

// 静态文件服务
app.use('/uploads', express.static(uploadsDir));

// 健康检查端点
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// 获取所有照片
app.get('/api/photos', async (req, res) => {
    try {
        console.log('收到获取照片列表请求');
        const photos = await Photo.find().sort({ date: -1 });
        console.log('返回照片数量:', photos.length);
        res.json(photos);
    } catch (error) {
        console.error('获取照片列表失败:', error);
        res.status(500).json({ error: 'Failed to fetch photos' });
    }
});

// 上传新照片
app.post('/api/photos', upload.single('image'), async (req, res) => {
    try {
        console.log('收到新的照片上传请求');
        console.log('请求体:', req.body);
        console.log('上传的文件:', req.file);

        const { title, description, date } = req.body;
        const imageUrl = `/uploads/${req.file.filename}`;
        
        const newPhoto = new Photo({
            title,
            description,
            date: new Date(date),
            imageUrl
        });
        
        console.log('创建新照片对象:', newPhoto);
        
        await newPhoto.save();
        console.log('照片保存成功');
        res.json(newPhoto);
    } catch (error) {
        console.error('上传照片时发生错误:', error);
        res.status(500).json({ error: 'Failed to upload photo' });
    }
});

// 删除照片
app.delete('/api/photos/:id', async (req, res) => {
    try {
        console.log('收到删除照片请求，ID:', req.params.id);
        const photo = await Photo.findByIdAndDelete(req.params.id);
        
        if (!photo) {
            return res.status(404).json({ error: 'Photo not found' });
        }
        
        const imagePath = path.join(uploadsDir, path.basename(photo.imageUrl));
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log('文件删除成功');
        }
        
        res.json({ message: 'Photo deleted successfully' });
    } catch (error) {
        console.error('删除照片时发生错误:', error);
        res.status(500).json({ error: 'Failed to delete photo' });
    }
});

// 获取所有信件
app.get('/api/letters', async (req, res) => {
    try {
        console.log('收到获取信件列表请求');
        const letters = await Letter.find().sort({ date: -1 });
        console.log('返回信件数量:', letters.length);
        res.json(letters);
    } catch (error) {
        console.error('获取信件列表失败:', error);
        res.status(500).json({ error: 'Failed to fetch letters' });
    }
});

// 获取单个信件
app.get('/api/letters/:id', async (req, res) => {
    try {
        console.log('收到获取信件请求，ID:', req.params.id);
        const letter = await Letter.findById(req.params.id);
        if (!letter) {
            return res.status(404).json({ error: 'Letter not found' });
        }
        res.json(letter);
    } catch (error) {
        console.error('获取信件失败:', error);
        res.status(500).json({ error: 'Failed to fetch letter' });
    }
});

// 创建新信件
app.post('/api/letters', async (req, res) => {
    try {
        console.log('收到创建信件请求');
        const { title, content, signature } = req.body;
        
        const newLetter = new Letter({
            title,
            content,
            signature: signature || '永远的朋友'
        });
        
        await newLetter.save();
        console.log('信件保存成功');
        res.json(newLetter);
    } catch (error) {
        console.error('创建信件失败:', error);
        res.status(500).json({ error: 'Failed to create letter' });
    }
});

// 更新信件
app.put('/api/letters/:id', async (req, res) => {
    try {
        console.log('收到更新信件请求，ID:', req.params.id);
        const { title, content, signature } = req.body;
        
        const letter = await Letter.findByIdAndUpdate(
            req.params.id,
            { title, content, signature },
            { new: true }
        );
        
        if (!letter) {
            return res.status(404).json({ error: 'Letter not found' });
        }
        
        console.log('信件更新成功');
        res.json(letter);
    } catch (error) {
        console.error('更新信件失败:', error);
        res.status(500).json({ error: 'Failed to update letter' });
    }
});

// 删除信件
app.delete('/api/letters/:id', async (req, res) => {
    try {
        console.log('收到删除信件请求，ID:', req.params.id);
        const letter = await Letter.findByIdAndDelete(req.params.id);
        
        if (!letter) {
            return res.status(404).json({ error: 'Letter not found' });
        }
        
        console.log('信件删除成功');
        res.json({ message: 'Letter deleted successfully' });
    } catch (error) {
        console.error('删除信件失败:', error);
        res.status(500).json({ error: 'Failed to delete letter' });
    }
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({ error: 'Internal Server Error' });
});

// 启动服务器
app.listen(port, () => {
    console.log(`服务器启动在端口 ${port}`);
    console.log('上传目录路径:', uploadsDir);
    console.log('MongoDB URI:', process.env.MONGODB_URI);
    console.log('环境变量:', {
        PORT: process.env.PORT,
        MONGODB_URI: process.env.MONGODB_URI,
        UPLOAD_DIR: process.env.UPLOAD_DIR
    });
}); 
