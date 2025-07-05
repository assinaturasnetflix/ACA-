// controllers.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const https = require('https'); // Necessário para a API de teste do Mpesa
const cloudinary = require('cloudinary').v2;
const { Product, Order, AdminUser } = require('./models');
const config = require('./config');

// --- Configuração do Cloudinary ---
// É preciso configurar o Cloudinary com as credenciais do nosso config.js
cloudinary.config(config.cloudinary);

// --- Agente HTTPS para a API M-Pesa Sandbox ---
// A API de sandbox do M-Pesa usa um certificado autoassinado, o que causa erros em Node.js.
// Esta configuração ignora a verificação do certificado APENAS para as requisições ao M-Pesa.
// ATENÇÃO: Não use rejectUnauthorized: false em produção com APIs que tenham certificados válidos.
const mpesaAgent = new https.Agent({
  rejectUnauthorized: false,
});

// =================================================================
// == CONTROLLERS DE AUTENTICAÇÃO E ADMIN ==========================
// =================================================================

// Criar um novo administrador (deve ser protegido ou usado apenas para setup inicial)
exports.registerAdmin = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Usuário e senha são obrigatórios.' });
    }

    const existingAdmin = await AdminUser.findOne({ username });
    if (existingAdmin) {
      return res.status(409).json({ message: 'Este nome de usuário já existe.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const admin = new AdminUser({ username, password: hashedPassword });
    await admin.save();

    res.status(201).json({ message: 'Administrador criado com sucesso.' });
  } catch (error) {
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
};

// Login do administrador
exports.loginAdmin = async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await AdminUser.findOne({ username });
    if (!admin) {
      return res.status(401).json({ message: 'Credenciais inválidas.' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Credenciais inválidas.' });
    }

    const token = jwt.sign({ id: admin._id, role: admin.role }, config.jwtSecret, { expiresIn: '8h' });

    res.status(200).json({ token, message: 'Login bem-sucedido!' });
  } catch (error) {
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
};


// =================================================================
// == CONTROLLERS DE PRODUTOS (Público e Admin) =====================
// =================================================================

// Criar um novo produto (Admin)
exports.createProduct = async (req, res) => {
  try {
    const { name, descriptionShort, descriptionFull, price, stock, olfactoryNotes, size, type, featured } = req.body;
    const images = req.files;

    if (!images || images.length === 0) {
      return res.status(400).json({ message: 'Pelo menos uma imagem é necessária.' });
    }
    
    const imageUploads = [];
    for (const image of images) {
      // O 'path' vem do middleware 'multer' que processa o upload
      const result = await cloudinary.uploader.upload(image.path, { folder: 'perfumes' });
      imageUploads.push({
        public_id: result.public_id,
        url: result.secure_url,
      });
    }

    const product = new Product({
      name,
      description: { short: descriptionShort, full: descriptionFull },
      price,
      images: imageUploads,
      stock,
      olfactoryNotes,
      size,
      type,
      featured,
    });

    await product.save();
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao criar produto', error: error.message });
  }
};

// Obter todos os produtos (Público)
exports.getAllProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar produtos', error: error.message });
  }
};

// Obter um único produto por ID (Público)
exports.getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Produto não encontrado.' });
        }
        res.status(200).json(product);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar produto', error: error.message });
    }
};

// Atualizar um produto (Admin)
exports.updateProduct = async (req, res) => {
  try {
    // Lógica para atualizar texto e, opcionalmente, imagens (mais complexa)
    const updatedProduct = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedProduct) {
        return res.status(404).json({ message: 'Produto não encontrado para atualizar.' });
    }
    res.status(200).json(updatedProduct);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao atualizar produto', error: error.message });
  }
};

// Deletar um produto (Admin)
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Produto não encontrado.' });
    }

    // Deletar imagens do Cloudinary antes de deletar o produto do DB
    for (const image of product.images) {
      await cloudinary.uploader.destroy(image.public_id);
    }

    await Product.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Produto deletado com sucesso.' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao deletar produto', error: error.message });
  }
};

// =================================================================
// == CONTROLLERS DE PEDIDOS E PAGAMENTO ===========================
// =================================================================

// Função utilitária para normalizar o número de telefone para o padrão M-Pesa
const normalizeMpesaNumber = (phone) => {
  let cleanPhone = phone.replace(/\D/g, ''); // Remove todos os não-dígitos
  if (cleanPhone.startsWith('0')) {
    cleanPhone = cleanPhone.substring(1); // Remove o '0' inicial, ex: 084 -> 84
  }
  if (cleanPhone.length === 9 && (cleanPhone.startsWith('84') || cleanPhone.startsWith('85'))) {
    return `258${cleanPhone}`;
  }
  if (cleanPhone.length === 12 && cleanPhone.startsWith('258')) {
    return cleanPhone; // Já está no formato correto
  }
  // Se não corresponder a um formato válido, retorna nulo para causar um erro controlado
  throw new Error(`Número de telefone '${phone}' é inválido para M-Pesa.`);
};

// Função utilitária para enviar notificações via WhatsApp
// O 'sock' (cliente Baileys) será passado do server.js
const sendWhatsAppMessage = async (sock, to, message) => {
    try {
        if (!sock) {
            console.log("Cliente WhatsApp (sock) não inicializado. Mensagem não enviada.");
            return;
        }
        // Formata o número para o padrão do Baileys (ex: 258841234567@s.whatsapp.net)
        const formattedNumber = `${to.replace(/\D/g, '')}@s.whatsapp.net`;
        await sock.sendMessage(formattedNumber, { text: message });
        console.log(`Mensagem enviada para ${formattedNumber}`);
    } catch (error) {
        console.error(`Falha ao enviar mensagem para ${to}:`, error);
    }
};

// Criar um novo pedido (Checkout)
// Esta função é um "higher-order function". Ela recebe 'sock' e retorna o controller.
// Isso nos permite injetar a dependência do cliente WhatsApp.
exports.createOrder = (sock) => async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { customerInfo, products, paymentMethod } = req.body;
        
        // Validação básica dos dados recebidos
        if (!customerInfo || !products || !paymentMethod) {
            return res.status(400).json({ message: "Dados do pedido incompletos." });
        }
        
        let totalAmount = 0;
        const productDetails = [];

        for (const item of products) {
            const product = await Product.findById(item.productId).session(session);
            if (!product) {
                throw new Error(`Produto com ID ${item.productId} não encontrado.`);
            }
            if (product.stock < item.quantity) {
                throw new Error(`Estoque insuficiente para o produto: ${product.name}.`);
            }
            
            totalAmount += product.price * item.quantity;
            productDetails.push({ product: product._id, quantity: item.quantity, price: product.price });

            // Decrementa o estoque
            product.stock -= item.quantity;
            await product.save({ session });
        }
        
        // Gera uma referência única para o pedido (Third Party Reference)
        const thirdPartyReference = `PERFUME_${Date.now()}`;
        
        const order = new Order({
            customerInfo,
            products: productDetails,
            totalAmount,
            paymentMethod,
            mpesaDetails: {
                thirdPartyReference: thirdPartyReference,
            }
        });

        await order.save({ session });

        // --- LÓGICA DE PAGAMENTO ---
        if (paymentMethod === 'Mpesa') {
            const mpesaPhoneNumber = normalizeMpesaNumber(customerInfo.phone);

            const mpesaPayload = {
                input_TransactionReference: thirdPartyReference,
                input_CustomerMSISDN: mpesaPhoneNumber,
                input_Amount: totalAmount.toString(),
                input_ThirdPartyReference: thirdPartyReference,
                input_ServiceProviderCode: config.mpesa.serviceProviderCode,
            };

            console.log("Enviando para M-Pesa:", mpesaPayload); // Log útil para debug

            const mpesaResponse = await axios.post(config.mpesa.apiURL, mpesaPayload, {
                headers: { 
                    'Authorization': config.mpesa.authToken, 
                    'Content-Type': 'application/json',
                    'Origin': '*' // Adicionado para corrigir o erro "Origin header is missing"
                },
                httpsAgent: mpesaAgent,
            });

            // Atualiza o pedido com a resposta inicial do M-Pesa
            order.mpesaDetails.conversationID = mpesaResponse.data.output_ConversationID;
            order.mpesaDetails.responseCode = mpesaResponse.data.output_ResponseCode;
            order.mpesaDetails.responseDescription = mpesaResponse.data.output_ResponseDesc;
            await order.save({ session });

            console.log("Pagamento M-Pesa iniciado. Resposta da API:", mpesaResponse.data);

        } else {
            // Lógica para outros métodos (simulados)
            order.paymentStatus = paymentMethod === 'Entrega' ? 'pending' : 'paid'; // Ex: "Entrega" fica pendente
            await order.save({ session });
        }

        await session.commitTransaction();
        
        // Envia notificação de pedido criado
        const message = `Olá ${customerInfo.name}, seu pedido #${order.trackingId} foi criado com sucesso! Total: ${totalAmount.toFixed(2)} MZN. Aguardando pagamento.`;
        await sendWhatsAppMessage(sock, customerInfo.phone, message);

        res.status(201).json({ 
            message: 'Pedido criado com sucesso!', 
            orderId: order._id,
            trackingId: order.trackingId,
            mpesaResponse: paymentMethod === 'Mpesa' ? mpesaResponse.data : null 
        });

    } catch (error) {
        await session.abortTransaction();
        
        // Log de erro aprimorado para debugging
        console.error("====== ERRO AO CRIAR PEDIDO ======");
        // Se o erro for do Axios (comunicação com M-Pesa), o erro real estará em `error.response.data`
        if (error.response) {
            console.error("Status do Erro:", error.response.status);
            console.error("Resposta da API externa (M-Pesa):", error.response.data);
            // Retorna uma mensagem de erro mais específica para o frontend
            const apiErrorMessage = error.response.data?.output_ResponseDesc || error.response.data?.output_error || 'Erro de comunicação com o serviço de pagamento.';
            return res.status(500).json({ message: `Falha na transação M-Pesa: ${apiErrorMessage}`, error: error.response.data });
        }
        
        // Para outros tipos de erro (ex: estoque, telefone inválido)
        console.error("Erro geral:", error.message);
        console.error(error.stack);
        res.status(500).json({ message: 'Erro ao criar o pedido', error: error.message });

    } finally {
        session.endSession();
    }
};

// Callback do M-Pesa para confirmar o pagamento
// Esta rota não será chamada pelo nosso frontend, mas sim pelo servidor do M-Pesa.
exports.mpesaCallback = (sock) => async (req, res) => {
    try {
        console.log('Callback M-Pesa recebido:', req.body);
        const {
            input_ThirdPartyReference: thirdPartyReference,
            input_ResultCode: resultCode,
            input_ResultDesc: resultDesc,
        } = req.body;

        if (!thirdPartyReference) {
            return res.status(400).json({ message: 'ThirdPartyReference não encontrado no callback.' });
        }

        const order = await Order.findOne({ 'mpesaDetails.thirdPartyReference': thirdPartyReference });
        if (!order) {
            console.error(`Pedido com referência ${thirdPartyReference} não encontrado.`);
            return res.status(404).send(); // Apenas responde, não envia JSON
        }

        order.mpesaDetails.responseCode = resultCode;
        order.mpesaDetails.responseDescription = resultDesc;

        let message = '';
        if (resultCode === 'INS-0') {
            order.paymentStatus = 'paid';
            order.orderStatus = 'processing';
            message = `Pagamento do seu pedido #${order.trackingId} foi confirmado! Já estamos a preparar a sua encomenda.`;
        } else {
            order.paymentStatus = 'failed';
            order.orderStatus = 'cancelled';
            message = `O pagamento do seu pedido #${order.trackingId} falhou. Motivo: ${resultDesc}. Por favor, tente novamente ou contacte o suporte.`;
            
            // Reverte o estoque se o pagamento falhar
            for (const item of order.products) {
                await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } });
            }
        }
        
        await order.save();
        
        // Envia notificação de status de pagamento
        await sendWhatsAppMessage(sock, order.customerInfo.phone, message);

        // Responde ao servidor M-Pesa para confirmar o recebimento do callback
        res.status(200).json({ message: 'Callback processado.' });

    } catch (error) {
        console.error('Erro no callback do M-Pesa:', error);
        res.status(500).send(); // Apenas responde, não envia JSON
    }
};

// Obter todos os pedidos (Admin)
exports.getAllOrders = async (req, res) => {
    try {
        const orders = await Order.find().populate('products.product').sort({ createdAt: -1 });
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar pedidos', error: error.message });
    }
};

// Atualizar status de um pedido (Admin)
exports.updateOrderStatus = (sock) => async (req, res) => {
    try {
        const { orderStatus } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ message: 'Pedido não encontrado' });
        }

        order.orderStatus = orderStatus;
        await order.save();
        
        // Notifica o cliente sobre a mudança de status
        const message = `Atualização do seu pedido #${order.trackingId}: O status foi alterado para "${orderStatus}".`;
        await sendWhatsAppMessage(sock, order.customerInfo.phone, message);

        res.status(200).json(order);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao atualizar status do pedido', error: error.message });
    }
};