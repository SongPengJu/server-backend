const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// CORS配置
const corsOptions = {
    origin: ['https://your-github-username.github.io', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type'],
    credentials: true
};

// 中间件
app.use(cors(corsOptions));
app.use(express.json());

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

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 限制5MB
    }
});

// 数据文件路径
const DATA_FILE = path.join(__dirname, 'data', 'photos.json');

// 确保数据目录存在
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    console.log('创建数据目录');
    fs.mkdirSync(dataDir);
}

// 确保数据文件存在
if (!fs.existsSync(DATA_FILE)) {
    console.log('创建数据文件');
    fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

// 静态文件服务
app.use('/uploads', express.static(uploadsDir));

// 健康检查端点
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// 读取照片数据
function readPhotos() {
    try {
        console.log('读取照片数据文件');
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        const photos = JSON.parse(data);
        console.log('成功读取照片数据，数量:', photos.length);
        return photos;
    } catch (error) {
        console.error('读取照片数据时出错:', error);
        return [];
    }
}

// 保存照片数据
function savePhotos(photos) {
    try {
        console.log('保存照片数据，数量:', photos.length);
        fs.writeFileSync(DATA_FILE, JSON.stringify(photos, null, 2));
        console.log('照片数据保存成功');
    } catch (error) {
        console.error('保存照片数据时出错:', error);
    }
}

// 获取所有照片
app.get('/api/photos', (req, res) => {
    console.log('收到获取照片列表请求');
    const photos = readPhotos();
    console.log('返回照片数量:', photos.length);
    res.json(photos);
});

// 上传新照片
app.post('/api/photos', upload.single('image'), (req, res) => {
    try {
        console.log('收到新的照片上传请求');
        console.log('请求体:', req.body);
        console.log('上传的文件:', req.file);

        const { title, description, date } = req.body;
        const imageUrl = `/uploads/${req.file.filename}`;
        
        const newPhoto = {
            _id: Date.now().toString(),
            title,
            description,
            date,
            imageUrl
        };
        
        console.log('创建新照片对象:', newPhoto);
        
        const photos = readPhotos();
        console.log('当前照片数量:', photos.length);
        
        photos.push(newPhoto);
        savePhotos(photos);
        
        console.log('照片上传成功，保存到文件系统');
        console.log('新的照片数量:', photos.length);
        
        res.json(newPhoto);
    } catch (error) {
        console.error('上传照片时发生错误:', error);
        res.status(500).json({ error: 'Failed to upload photo' });
    }
});

// 删除照片
app.delete('/api/photos/:id', (req, res) => {
    try {
        console.log('收到删除照片请求，ID:', req.params.id);
        const id = req.params.id;
        const photos = readPhotos();
        const photoIndex = photos.findIndex(p => p._id === id);
        
        if (photoIndex === -1) {
            console.log('未找到要删除的照片');
            return res.status(404).json({ error: 'Photo not found' });
        }
        
        const photo = photos[photoIndex];
        const imagePath = path.join(uploadsDir, path.basename(photo.imageUrl));
        
        console.log('准备删除文件:', imagePath);
        
        // 删除文件
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log('文件删除成功');
        } else {
            console.log('文件不存在，跳过删除');
        }
        
        // 从数组中移除
        photos.splice(photoIndex, 1);
        savePhotos(photos);
        
        console.log('照片数据已从列表中删除');
        console.log('剩余照片数量:', photos.length);
        
        res.json({ message: 'Photo deleted successfully' });
    } catch (error) {
        console.error('删除照片时发生错误:', error);
        res.status(500).json({ error: 'Failed to delete photo' });
    }
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(port, () => {
    console.log(`服务器启动在端口 ${port}`);
    console.log('数据文件路径:', DATA_FILE);
    console.log('上传目录路径:', uploadsDir);
}); 