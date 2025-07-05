// routes.js

const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const config = require('./config');
const controllers = require('./controllers');

const router = express.Router();

// --- Configuração do Multer para Upload de Imagens ---
// Vamos salvar os arquivos temporariamente em disco antes de enviar para o Cloudinary.
const storage = multer.diskStorage({}); // Usar storage vazio, Cloudinary lida com o path
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limite de 5MB por imagem
  fileFilter: (req, file, cb) => {
    // Validar tipo de arquivo
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error(`Erro: Apenas imagens são permitidas (${filetypes})`));
  },
});

// --- Middleware de Autenticação para Rotas de Admin ---
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Acesso negado. Nenhum token fornecido.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded; // Adiciona os dados do usuário (id, role) ao objeto req
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token inválido.' });
  }
};

// --- Função para inicializar as rotas com a dependência do Baileys (sock) ---
const initializeRoutes = (sock) => {

  // ===============================================
  // == ROTAS PÚBLICAS (Acessíveis pelo cliente) ==
  // ===============================================

  // Produtos
  router.get('/products', controllers.getAllProducts);
  router.get('/products/:id', controllers.getProductById);

  // Pedidos
  // O controller 'createOrder' precisa do 'sock' para enviar notificações
  router.post('/orders/checkout', controllers.createOrder(sock));

  // Callback do M-Pesa (esta rota será chamada pelo servidor do M-Pesa)
  router.post('/payments/mpesa-callback', controllers.mpesaCallback(sock));


  // ====================================================
  // == ROTAS ADMINISTRATIVAS (Protegidas)             ==
  // ====================================================

  // Autenticação do Admin
  router.post('/admin/register', controllers.registerAdmin); // Manter aberto para setup inicial ou proteger
  router.post('/admin/login', controllers.loginAdmin);

  // Gestão de Produtos (CRUD)
  // `authMiddleware` é usado para proteger estas rotas
  // `upload.array('images', 5)` processa até 5 arquivos no campo 'images'
  router.post('/admin/products', authMiddleware, upload.array('images', 5), controllers.createProduct);
  router.put('/admin/products/:id', authMiddleware, controllers.updateProduct);
  router.delete('/admin/products/:id', authMiddleware, controllers.deleteProduct);

  // Gestão de Pedidos
  router.get('/admin/orders', authMiddleware, controllers.getAllOrders);
  // O controller 'updateOrderStatus' também precisa do 'sock'
  router.put('/admin/orders/:id/status', authMiddleware, controllers.updateOrderStatus(sock));


  // Rota de Teste (para verificar se a API está online)
  router.get('/', (req, res) => {
    res.json({ message: 'API da Loja de Perfumes Online' });
  });

  return router;
};

// Exportamos a função de inicialização
module.exports = initializeRoutes;