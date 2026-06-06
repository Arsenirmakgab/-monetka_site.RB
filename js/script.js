// Подключение к созданной базе данных Firebase Realtime Database
const firebaseConfig = {
    databaseURL: "https://monetka-market-default-rtdb.europe-west1.firebasedatabase.app/"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// РЕЖИМ ТЕСТИРОВАНИЯ УЦЕНКИ
// false - уценка сработает через 15 и 30 дней.
// true  - уценка сработает через 1 и 2 минуты (для проверки кода).
const TEST_MODE = false; 

let products = [];
let cart = JSON.parse(localStorage.getItem('monetka_cart')) || [];
let currentCategory = 'all';
let isAdminMode = localStorage.getItem('monetka_admin') === 'true';
let uploadedImagesBase64 = []; 

document.addEventListener('DOMContentLoaded', () => {
    applyAdminUI();
    updateCartUI();
    listenToCloudProducts();
});

function applyAdminUI() {
    const indicator = document.getElementById('admin-indicator');
    const floatBtn = document.getElementById('panel-add-btn');
    if (isAdminMode) {
        if (indicator) indicator.style.display = 'flex';
        if (floatBtn) floatBtn.style.display = 'flex';
    } else {
        if (indicator) indicator.style.display = 'none';
        if (floatBtn) floatBtn.style.display = 'none';
    }
}

// Слушаем изменения в Firebase — сайт сам обновится на всех устройствах при добавлении или удалении карточки
function listenToCloudProducts() {
    db.ref('products').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            products = Object.values(data).sort((a, b) => b.id - a.id);
        } else {
            products = [];
        }
        localStorage.setItem('monetka_products_backup', JSON.stringify(products));
        renderCategories();
        renderProducts();
    }, (error) => {
        console.log("Ошибка сети, работа на локальном бекапе:", error);
        const localData = localStorage.getItem('monetka_products_backup');
        if (localData) {
            products = JSON.parse(localData);
            renderCategories();
            renderProducts();
        }
    });
}

function handleLogoClick() {
    switchTab('shop');
    if (!isAdminMode) {
        let pass = prompt("Введите пароль администратора:");
        if (pass === "13579") {
            localStorage.setItem('monetka_admin', 'true');
            alert("Вход выполнен успешно!");
            location.reload(); 
        } else if (pass !== null) {
            alert("Неверный пароль!");
        }
    }
}

function logoutAdmin() {
    if (confirm("Выйти из режима администратора?")) {
        localStorage.removeItem('monetka_admin');
        location.reload();
    }
}

// АВТОМАТИЧЕСКИЙ РАСЧЕТ ТЕКУЩЕЙ ЦЕНЫ С УЧЕТОМ СРОКА И ТУМБЛЕРА АДМИНА
function calculateCurrentPrice(prod) {
    const basePrice = Number(prod.price);
    
    // Если уценка принудительно отключена админом при создании товара
    if (prod.allowMarkdown === false || !prod.timestamp) {
        return { current: basePrice, oldPrices: [], badge: null };
    }

    const now = Date.now();
    const diffMs = now - prod.timestamp;
    
    // Установка интервалов в зависимости от режима (Минуты для теста / Дни для продакшена)
    const interval1 = TEST_MODE ? (60 * 1000) : (15 * 24 * 60 * 60 * 1000); 
    const interval2 = TEST_MODE ? (120 * 1000) : (30 * 24 * 60 * 60 * 1000);

    if (diffMs >= interval2) {
        // Прошло 30 дней: первая уценка (-20%), затем от полученной цены еще -30%
        const price1 = Math.round(basePrice * 0.8 * 100) / 100;
        const price2 = Math.round(price1 * 0.7 * 100) / 100;
        return {
            current: price2,
            oldPrices: [basePrice, price1],
            badge: '-30%'
        };
    } else if (diffMs >= interval1) {
        // Прошло 15 дней: уценка -20%
        const price1 = Math.round(basePrice * 0.8 * 100) / 100;
        return {
            current: price1,
            oldPrices: [basePrice],
            badge: '-20%'
        };
    }

    return { current: basePrice, oldPrices: [], badge: null };
}

// ОПТИМИЗАЦИЯ И СЖАТИЕ ФОТО (Переваривает картинки любого веса, хоть по 10 МБ)
function compressImage(file, callback) {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = function (event) {
        const img = new Image();
        img.src = event.target.result;
        img.onload = function () {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const max_size = 800; // Ограничиваем максимальную ширину/высоту до 800px

            if (width > height) {
                if (width > max_size) { height *= max_size / width; width = max_size; }
            } else {
                if (height > max_size) { width *= max_size / height; height = max_size; }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // Конвертируем в компактный JPEG с качеством 70%
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
            callback(compressedBase64);
        };
    };
}

function handleMultipleFiles(event) {
    const files = Array.from(event.target.files);
    if (uploadedImagesBase64.length + files.length > 3) {
        alert("Можно загрузить максимум 3 фото!");
        return;
    }
    files.forEach(file => {
        compressImage(file, function(compressedBase64) {
            uploadedImagesBase64.push(compressedBase64);
            renderThumbnails();
        });
    });
    event.target.value = "";
}

function renderThumbnails() {
    const container = document.getElementById('thumb-container');
    if (!container) return;
    container.innerHTML = uploadedImagesBase64.map((img, idx) => `
        <div class="thumb-wrapper">
            <img src="${img}">
            <button class="thumb-remove" onclick="removeThumbnail(${idx})">&times;</button>
        </div>
    `).join('');
}

function removeThumbnail(index) {
    uploadedImagesBase64.splice(index, 1);
    renderThumbnails();
}

function openAdminModal() {
    uploadedImagesBase64 = [];
    renderThumbnails();
    const modal = document.getElementById('admin-modal');
    if(modal) modal.style.display = 'flex';
}

// ЗАЩИЩЕННАЯ ФУНКЦИЯ ОТПРАВКИ КАРТОЧКИ В ОБЛАКО FIREBASE
function addNewProductFromSite() {
    try {
        const titleEl = document.getElementById('admin-title');
        const priceEl = document.getElementById('admin-price');
        const categoryEl = document.getElementById('admin-category');
        const descEl = document.getElementById('admin-desc');
        const markdownEl = document.getElementById('admin-allow-markdown');

        if (!titleEl || !priceEl) {
            alert("Критическая ошибка: Элементы формы не найдены в коде HTML!");
            return;
        }

        const title = titleEl.value.trim();
        const price = priceEl.value;
        const category = categoryEl ? categoryEl.value : "Общее";
        const desc = descEl ? descEl.value.trim() : "Описание отсутствует.";
        const allowMarkdown = markdownEl ? markdownEl.checked : true;

        if (!title || !price) {
            alert("Пожалуйста, заполните обязательные поля (Название и Цена)!");
            return;
        }

        if (typeof firebase === 'undefined') {
            alert("Ошибка: Библиотеки Firebase не загружены в index.html!");
            return;
        }

        const productId = Date.now();
        const newProduct = {
            id: productId, 
            timestamp: Date.now(), // Точная метка времени для уценки
            title: title,
            price: parseFloat(price),
            category: category,
            desc: desc,
            allowMarkdown: allowMarkdown, 
            images: [...uploadedImagesBase64] 
        };

        db.ref('products/' + productId).set(newProduct)
        .then(() => {
            titleEl.value = '';
            priceEl.value = '';
            if(descEl) descEl.value = '';
            uploadedImagesBase64 = [];
            closeModal('admin-modal');
            alert("✅ Товар успешно сохранен в облачную базу данных!");
        })
        .catch((err) => {
            alert("Ошибка сохранения. Firebase отклонил запрос.");
            console.error(err);
        });

    } catch (error) {
        alert("Произошла ошибка в работе скрипта: " + error.message);
        console.error(error);
    }
}

function deleteProduct(id, event) {
    event.stopPropagation(); 
    if (confirm("Удалить этот товар? Он исчезнет со всех устройств навсегда.")) {
        db.ref('products/' + id).remove();
    }
}

function generateSliderHtml(productId, imagesArray) {
    const imgs = (imagesArray && imagesArray.length > 0) ? imagesArray : ['https://via.placeholder.com/480x320/1f293d/ffffff?text=📦'];
    let slidesHtml = imgs.map(img => `<div class="slider-slide"><img src="${img}" loading="lazy"></div>`).join('');
    let arrowsHtml = '';
    if (imgs.length > 1) {
        arrowsHtml = `
            <button class="slider-arrow prev" onclick="moveSlider(${productId}, -1, event)">◀</button>
            <button class="slider-arrow next" onclick="moveSlider(${productId}, 1, event)">▶</button>
        `;
    }
    return `<div class="product-slider" id="slider-${productId}" data-current="0" data-max="${imgs.length}"><div class="slider-track" id="track-${productId}">${slidesHtml}</div>${arrowsHtml}</div>`;
}

function moveSlider(productId, direction, event) {
    if (event) event.stopPropagation();
    const slider = document.getElementById(`slider-${productId}`);
    const track = document.getElementById(`track-${productId}`);
    if (!slider || !track) return;
    let current = parseInt(slider.getAttribute('data-current'));
    const max = parseInt(slider.getAttribute('data-max'));
    current += direction;
    if (current < 0) current = max - 1;
    if (current >= max) current = 0;
    slider.setAttribute('data-current', current);
    track.style.transform = `translateX(-${current * 100}%)`;
}

function renderProducts() {
    const container = document.getElementById('products-container');
    if (!container) return;
    container.innerHTML = '';

    const filtered = currentCategory === 'all' ? products : products.filter(p => p.category === currentCategory);

    if (filtered.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem 0; grid-column: span 3; font-size:0.8rem;">Товаров пока нет.</p>';
        return;
    }

    filtered.forEach((prod) => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.setAttribute('onclick', `openDetailModal(${prod.id}, event)`);

        // Вычисляем текущую цену с уценкой
        const priceInfo = calculateCurrentPrice(prod);

        const deleteButtonHtml = isAdminMode ? `
            <button class="delete-card-btn" onclick="deleteProduct(${prod.id}, event)">
                <i class="fa-solid fa-trash"></i>
            </button>` : '';
        
        const imagesList = prod.images ? Object.values(prod.images) : [];
        const coverPhoto = imagesList.length > 0 ? imagesList[0] : 'https://via.placeholder.com/150x200/1f293d/ffffff?text=📦';

        // Формируем блок зачеркнутых цен
        let oldPricesHtml = '';
        let isDiscountedClass = '';
        if (priceInfo.oldPrices.length > 0) {
            isDiscountedClass = 'discounted';
            oldPricesHtml = `<div class="old-prices-box">${priceInfo.oldPrices.map(p => p + ' BYN').join(' → ')}</div>`;
        }

        let badgeHtml = priceInfo.badge ? `<div class="markdown-badge">${priceInfo.badge}</div>` : '';

        card.innerHTML = `
            ${badgeHtml}
            <img src="${coverPhoto}" class="product-main-photo" loading="lazy">
            <div class="product-info">
                <div class="price-container">
                    ${oldPricesHtml}
                    <div class="product-price ${isDiscountedClass}">${priceInfo.current} BYN</div>
                </div>
                <div class="product-title">${prod.title}</div>
                <div class="card-actions-row">
                    <button class="card-btn" onclick="addToCartWithPrice(${prod.id}, ${priceInfo.current}, event)">
                        <i class="fa-solid fa-cart-plus"></i>
                    </button>
                    ${deleteButtonHtml}
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function openDetailModal(id, event) {
    if (event.target.closest('.card-btn') || event.target.closest('.delete-card-btn')) return;
    const prod = products.find(p => p.id === id);
    if (!prod) return;

    const priceInfo = calculateCurrentPrice(prod);
    const content = document.getElementById('modal-detail-content');
    const imagesList = prod.images ? Object.values(prod.images) : [];
    const modalSliderHtml = generateSliderHtml(prod.id + 9999, imagesList);

    let oldPricesHtml = '';
    if (priceInfo.oldPrices.length > 0) {
        oldPricesHtml = `<div style="font-size:0.9rem; color:var(--text-muted); text-decoration:line-through; margin-bottom: 2px;">Старая цена: ${priceInfo.oldPrices.map(p => p + ' BYN').join(' → ')}</div>`;
    }

    content.innerHTML = `
        <div style="position:relative;">${modalSliderHtml}</div>
        <div style="padding: 1.2rem;">
            <h2 style="font-size: 1.4rem; margin-bottom:0.2rem; color:#fff;">${prod.title}</h2>
            <p style="color: #1abc9c; font-size:0.85rem; margin-bottom: 1rem;">Категория: ${prod.category}</p>
            <div style="margin-bottom:1.2rem;">
                ${oldPricesHtml}
                <div style="font-size:1.6rem; color:${priceInfo.oldPrices.length > 0 ? 'var(--discount-color)' : 'var(--primary)'}; font-weight:800;">${priceInfo.current} BYN</div>
            </div>
            <h3 style="margin-bottom: 0.4rem; font-size: 1rem; color:#fff;">Описание:</h3>
            <p style="color: var(--text-muted); line-height: 1.5; font-size:0.9rem;">${prod.desc}</p>
            <button class="card-btn" style="margin-top: 1.5rem; width:100%; padding:1rem; font-size: 0.9rem;" onclick="addToCartWithPrice(${prod.id}, ${priceInfo.current}, null); closeModal('product-detail-modal');">
                <i class="fa-solid fa-cart-plus"></i> Добавить в корзину
            </button>
        </div>
    `;
    document.getElementById('product-detail-modal').style.display = 'flex';
}

function switchTab(tabName) {
    document.querySelectorAll('.mobile-nav-item').forEach(item => item.classList.remove('active'));
    const activeNav = document.getElementById(`nav-${tabName}`);
    if (activeNav) activeNav.classList.add('active');
    document.querySelectorAll('.section').forEach(sec => sec.style.display = 'none');
    document.getElementById(`${tabName}-section`).style.display = 'block';
    const categoriesWrapper = document.getElementById('categories-wrapper');
    if (categoriesWrapper) categoriesWrapper.style.display = tabName === 'shop' ? 'block' : 'none';
}

function renderCategories() {
    const baseCategories = ['all'];
    products.forEach(p => {
        if (p.category && !baseCategories.includes(p.category)) baseCategories.push(p.category);
    });
    const container = document.getElementById('categories-list');
    if (!container) return;
    container.innerHTML = baseCategories.map(cat => `<div class="category-chip ${currentCategory === cat ? 'active' : ''}" onclick="changeCategory('${cat}')">${cat === 'all' ? 'Все' : cat}</div>`).join('');
}

function changeCategory(category) {
    currentCategory = category;
    renderCategories();
    renderProducts();
}

function addToCartWithPrice(id, currentPrice, event) {
    if(event) event.stopPropagation();
    const prod = products.find(p => p.id === id);
    if (!prod) return;

    // Фиксируем уцененную цену на момент добавления в корзину
    const cartItem = {
        ...prod,
        finalPrice: currentPrice 
    };

    cart.push(cartItem);
    localStorage.setItem('monetka_cart', JSON.stringify(cart));
    updateCartUI();
}

function removeFromCart(index) {
    cart.splice(index, 1);
    localStorage.setItem('monetka_cart', JSON.stringify(cart));
    updateCartUI();
    renderCartItems();
}

function updateCartUI() {
    const countElement = document.getElementById('cart-count');
    if (countElement) countElement.textContent = cart.length;
}

function openCartModal() {
    document.getElementById('cart-modal').style.display = 'flex';
    renderCartItems();
}

function renderCartItems() {
    const container = document.getElementById('cart-items-container');
    const totalElement = document.getElementById('cart-total-price');
    if (!container) return;
    
    if (cart.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding: 2rem 0;">Корзина пока пуста</p>';
        totalElement.textContent = '0.00 BYN';
        return;
    }

    let total = 0;
    container.innerHTML = cart.map((item, index) => {
        const itemPrice = Number(item.finalPrice || item.price);
        total += itemPrice;
        const imagesList = item.images ? Object.values(item.images) : [];
        const itemPhoto = imagesList.length > 0 ? imagesList[0] : 'https://via.placeholder.com/100x100/1f293d/ffffff?text=📦';
        return `
            <div class="cart-item">
                <img src="${itemPhoto}" style="width:50px; height:50px; object-fit:cover; border-radius:6px;">
                <div class="cart-item-info">
                    <h4>${item.title}</h4>
                    <span style="color: var(--discount-color); font-weight: bold;">${itemPrice.toLocaleString()} BYN</span>
                </div>
                <button class="remove-item-btn" onclick="removeFromCart(${index})"><i class="fa-solid fa-trash-can"></i></button>
            </div>
        `;
    }).join('');

    totalElement.textContent = `${total.toLocaleString()} BYN`;
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}
