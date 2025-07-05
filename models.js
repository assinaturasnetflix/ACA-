// models.js

const mongoose = require('mongoose');

// --- Schema para os Produtos (Perfumes) ---
const ProductSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'O nome do perfume é obrigatório.'],
    trim: true,
  },
  description: {
    short: {
      type: String,
      required: [true, 'A descrição curta é obrigatória.'],
      maxLength: [150, 'A descrição curta não pode exceder 150 caracteres.'],
    },
    full: {
      type: String,
      required: [true, 'A descrição completa é obrigatória.'],
    },
  },
  price: {
    type: Number,
    required: [true, 'O preço é obrigatório.'],
    min: 0,
  },
  images: [{
    public_id: { type: String, required: true }, // ID público do Cloudinary
    url: { type: String, required: true },       // URL da imagem no Cloudinary
  }],
  stock: {
    type: Number,
    required: true,
    default: 0,
  },
  olfactoryNotes: {
    type: String,
    trim: true,
  },
  size: {
    type: String, // Ex: "100ml"
    required: true,
  },
  type: {
    type: String,
    required: true,
    enum: ['Masculino', 'Feminino', 'Unissex'], // Valores permitidos
  },
  featured: { // Para destacar na página inicial
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true, // Adiciona createdAt e updatedAt automaticamente
});

// --- Schema para os Pedidos (Orders) ---
const OrderSchema = new mongoose.Schema({
  customerInfo: {
    name: { type: String, required: true },
    phone: { type: String, required: true }, // Usado para pagamento Mpesa e notificações WhatsApp
    address: { type: String, required: true },
  },
  products: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product', // Referência ao modelo de Produto
      required: true,
    },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true }, // Preço no momento da compra
  }],
  totalAmount: {
    type: Number,
    required: true,
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['Mpesa', 'Emola', 'Cartao', 'Entrega'], // Métodos de pagamento simulados/reais
  },
  paymentStatus: {
    type: String,
    required: true,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending',
  },
  orderStatus: {
    type: String,
    required: true,
    enum: ['processing', 'shipped', 'delivered', 'cancelled'],
    default: 'processing',
  },
  mpesaDetails: { // Para armazenar informações da transação Mpesa
    transactionReference: { type: String },
    thirdPartyReference: { type: String },
    conversationID: { type: String }, // ID retornado pela API Mpesa
    responseCode: { type: String },
    responseDescription: { type: String },
  },
  trackingId: { // Para rastreamento da entrega
    type: String,
    default: () => new mongoose.Types.ObjectId().toString(), // Um ID único simples
  }
}, {
  timestamps: true,
});


// --- Schema para o Usuário Administrador ---
const AdminUserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
    // A senha será hasheada no controller antes de salvar
  },
  role: {
    type: String,
    default: 'admin',
  }
}, {
  timestamps: true
});


// Exporta os modelos para serem usados em outras partes da aplicação
const Product = mongoose.model('Product', ProductSchema);
const Order = mongoose.model('Order', OrderSchema);
const AdminUser = mongoose.model('AdminUser', AdminUserSchema);

module.exports = {
  Product,
  Order,
  AdminUser,
};