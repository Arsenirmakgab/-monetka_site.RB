const JSONBIN_URL = "https://api.jsonbin.io/v3/b/663f7db2e41b4d34e4f2eb30";
const JSONBIN_KEY = "$2a$10$7R3k4vj9G9hS8W4GjE7XUeK3k2x0D5Z5m0X8Z8q8y8u8i8o8p8e8i"; 

let products = [];
let cart = JSON.parse(localStorage.getItem('monetka_cart')) || [];
let currentCategory = 'all';

// Проверяем сохраненную сессию администратора в localStorage
let isAdminMode = localStorage.getItem('monetka_admin') === 'true';
let uploadedImagesBase64 = []; // Массив строк картинок (макс 3 штуки)

document.addEventListener('DOMContentLoaded', () => {
    applyAdminUI();
    loadProductsFromCloud();
    updateCartUI();
    setInterval(loadProductsFromCloud, 5000);
});

// Настройка интерфейса в зависимости от того, админ пользователь или нет
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

// Загрузка данных из облака
async function loadProductsFromCloud() {
    try {
        const response = await fetch(`${JSONBIN_URL}/latest`, {
            headers: { "X-Master-Key": JSONBIN_KEY }
        });
        const data = await response.json();
        
        if (JSON.stringify(products) !== JSON.stringify(data.record)) {
            products = data.record || [];
            renderCategories();
            renderProducts();
        }
    } catch (err) {
        console.error("Ошибка синхронизации:", err);
    }
}

// Сохранение данных в облако
async function saveProductsToCloud(updatedList) {
    try {
        const response = await fetch(JSONBIN_URL, {
            method: 'PUT',
            headers: {
                "Content-Type": "application/json",
                "X-Master-Key": JSONBIN_KEY
            },
            body: JSON.stringify(updatedList)
        });
        if (response.ok) {
            products = updatedList; 
            renderCategories();
            renderProducts(); 
        }
    } catch (err) {
        alert("Не удалось обновить каталог в облаке.");
    }
}

// Клик по логотипу — если не админ, предлагает войти
function handleLogoClick() {
    switchTab('shop');
    if (!isAdminMode) {
        let pass = prompt("Введите пароль администратора:");
        if (pass === "13579") {
            localStorage.setItem('monetka_admin', 'true');
            alert("Вход выполнен! Страница будет перезагружена.");
            location.reload(); // Перезагрузка устройства с видом админа
        } else if (pass !== null) {
            alert("Неверный пароль!");
        }
    }
}

// Выход из режима администратора
function logoutAdmin() {
    if (confirm("Выйти из режима администратора?")) {
        localStorage.removeItem('monetka_admin');
        alert("Вы вышли. Страница перезагружается.");
        location.reload();
    }
}

// Обработка мультизагрузки фото (до 3-х штук)
function handleMultipleFiles(event) {
    const files = Array.from(event.target.files);
    
    if (uploadedImagesBase64.length + files.length > 3) {
        alert("Можно загрузить не более 3-х фотографий на один товар!");
        return;
    }

    files.forEach(file => {
        if (file.size > 2 * 1024 * 1024) {
            alert(`Файл ${file.name} слишком большой (более 2МБ)!`);
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            uploadedImagesBase64.push(e.target.result);
            renderThumbnails();
        };
        reader.readAsDataURL(file);
    });
    // Сбрасываем инпут, чтобы можно было выбирать те же файлы
    event.target.value = "";
}

// Отрисовка миниатюр в форме добавления
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
    document.getElementById('admin-modal').style.display = 'flex';
}

// Публикация карточки товара
function addNewProductFromSite() {
    const title = document.getElementById('admin-title').value.trim();
    const price = document.getElementById('admin-price').value;
    const category = document.getElementById('admin-category').value;
    const desc = document.getElementById('admin-desc').value.trim();

    if (!title || !price) {
        alert("Заполните Название и Цену!");
        return;
    }

    const newProduct = {
        id: Date.now(), 
        title: title,
        price: parseFloat(price),
        category: category,
        desc: desc || "Описание отсутствует.",
        // Сохраняем массив картинок (или пустой массив, если фото не прикрепили)
        images: [...uploadedImagesBase64] 
    };

    const updatedList = [newProduct, ...products];
    saveProductsToCloud(updatedList);

    // Сброс формы и закрытие
    document.getElementById('admin-title').value = '';
    document.getElementById('admin-price').value = '';
    document.getElementById('admin-desc').value = '';
    uploadedImagesBase64 = [];
    
    closeModal('admin-modal');
    alert("✅ Товар успешно опубликован!");
}

function deleteProduct(id, event) {
    event.stopPropagation(); 
    if (confirm("Удалить этот товар из базы?")) {
        const updatedList = products.filter(p => p.id !== id);
        saveProductsToCloud(updatedList);
    }
}

// Генерация слайдера (карусели изображений) для карточки товара
function generateSliderHtml(productId, imagesArray) {
    // Если картинок вообще нет, ставим стандартную коробку-заглушку
    const imgs = (imagesArray && imagesArray.length > 0) ? imagesArray : ['https://via.placeholder.com/480x320/1f293d/ffffff?text=📦+Товар'];
    
    let slidesHtml = imgs.map(img => `<div class="slider-slide"><img src="${img}" loading="lazy"></div>`).join('');
    
    let arrowsHtml = '';
    let dotsHtml = '';
    
    if (imgs.length > 1) {
        arrowsHtml = `
            <button class="slider-arrow prev" onclick="moveSlider(${productId}, -1, event)"><i class="fa-solid fa-chevron-left"></i></button>
            <button class="slider-arrow next" onclick="moveSlider(${productId}, 1, event)"><i class="fa-solid fa-chevron-right"></i></button>
        `;
        dotsHtml = `<div class="slider-dots" id="dots-${productId}">` + 
            imgs.map((_, i) => `<div class="slider-dot ${i === 0 ? 'active' : ''}"></div>`).join('') + 
            `</div>`;
    }

    return `
        <div class="product-slider" id="slider-${productId}" data-current="0" data-max="${imgs.length}">
            <div class="slider-track" id="track-${productId}">
                ${slidesHtml}
            </div>
            ${arrowsHtml}
            ${dotsHtml}
        </div>
    `;
}

// Управление свайпом/клик слайдера
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

    // Обновление точек индикатора
    const dotsContainer = document.getElementById(`dots-${productId}`);
    if (dotsContainer) {
        const dots = dotsContainer.querySelectorAll('.slider-dot');
        dots.forEach((dot, idx) => {
            if (idx === current) dot.classList.add('active');
            else dot.classList.remove('active');
        });
    }
}

function renderProducts() {
    const container = document.getElementById('products-container');
    if (!container) return;
    container.innerHTML = '';

    const filtered = currentCategory === 'all' ? products : products.filter(p => p.category === currentCategory);

    if (filtered.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 3rem 0; width:100%;">Товаров пока нет.</p>';
        return;
    }

    filtered.forEach((prod) => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.setAttribute('onclick', `openDetailModal(${prod.id}, event)`);

        const deleteButtonHtml = isAdminMode ? `<button class="delete-card-btn" onclick="deleteProduct(${prod.id}, event)"><i class="fa-solid fa-trash"></i> Удалить карточку</button>` : '';
        
        // Поддерживаем старую структуру 'img' и новую 'images' для стабильности
        const imagesList = prod.images ? prod.images : (prod.img ? [prod.img] : []);
        const sliderHtml = generateSliderHtml(prod.id, imagesList);

        card.innerHTML = `
            <div class="product-img-wrapper" style="height:auto;">
                ${sliderHtml}
            </div>
            <div class="product-info">
                <div class="product-price">${Number(prod.price).toLocaleString()} BYN</div>
                <div class="product-title">${prod.title}</div>
                <div class="product-desc">${prod.desc}</div>
                <button class="card-btn" onclick="addToCart(${prod.id}, event)">
                    <i class="fa-solid fa-cart-plus"></i> В корзину
                </button>
                ${deleteButtonHtml}
            </div>
        `;
        container.appendChild(card);
    });
}

function openDetailModal(id, event) {
    if (event.target.closest('.card-btn') || event.target.closest('.delete-card-btn') || event.target.closest('.slider-arrow')) return;
    const prod = products.find(p => p.id === id);
    if (!prod) return;

    const content = document.getElementById('modal-detail-content');
    const imagesList = prod.images ? prod.images : (prod.img ? [prod.img] : []);
    
    // Генерируем уникальный слайдер для модального окна (ID делаем отрицательным, чтоб не путать с витриной)
    const modalSliderHtml = generateSliderHtml(-prod.id, imagesList);

    content.innerHTML = `
        <div style="position:relative;">
            ${modalSliderHtml}
        </div>
        <div style="padding: 1.2rem;">
            <h2 style="font-size: 1.4rem; margin-bottom:0.2rem;">${prod.title}</h2>
            <p style="color: #1abc9c; font-size:0.85rem; margin-bottom: 1rem;">Категория: ${prod.category}</p>
            <div class="modal-price" style="font-size:1.6rem; color:var(--primary); font-weight:800; margin-bottom:1.2rem;">${Number(prod.price).toLocaleString()} BYN</div>
            <h3 style="margin-bottom: 0.4rem; font-size: 1rem; color:#fff;">Описание:</h3>
            <p style="color: var(--text-muted); line-height: 1.5; font-size:0.9rem;">${prod.desc}</p>
            <button class="card-btn" style="margin-top: 1.5rem; width:100%; padding:1rem;" onclick="addToCart(${prod.id}, null); closeModal('product-detail-modal');">
                <i class="fa-solid fa-cart-plus"></i> Добавить в корзину
            </button>
        </div>
    `;
    document.getElementById('product-detail-modal').style.display = 'flex';
}

// Смена разделов таба в нижнем меню
function switchTab(tabName) {
    document.querySelectorAll('.mobile-nav-item').forEach(item => item.classList.remove('active'));
    const activeNav = document.getElementById(`nav-${tabName}`);
    if (activeNav) activeNav.classList.add('active');
    
    document.querySelectorAll('.section').forEach(sec => sec.style.display = 'none');
    const activeSection = document.getElementById(`${tabName}-section`);
    if (activeSection) activeSection.style.display = 'block';
}

function renderCategories() {
    const baseCategories = ['all'];
    products.forEach(p => {
        if (p.category && !baseCategories.includes(p.category)) {
            baseCategories.push(p.category);
        }
    });
    
    const container = document.getElementById('categories-list');
    if (!container) return;
    
    container.innerHTML = baseCategories.map(cat => {
        const name = cat === 'all' ? 'Все' : cat;
        return `<div class="category-chip ${currentCategory === cat ? 'active' : ''}" onclick="changeCategory('${cat}')">${name}</div>`;
    }).join('');
}

function changeCategory(category) {
    currentCategory = category;
    renderCategories();
    renderProducts();
}

function addToCart(id, event) {
    if(event) event.stopPropagation();
    const prod = products.find(p => p.id === id);
    if (!prod) return;

    cart.push(prod);
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
        total += Number(item.price);
        const imagesList = item.images ? item.images : (item.img ? [item.img] : []);
        const itemPhoto = imagesList.length > 0 ? imagesList[0] : 'https://via.placeholder.com/100x100/1f293d/ffffff?text=📦';
        return `
            <div class="cart-item">
                <img src="${itemPhoto}" alt="" style="width:50px; height:50px; object-fit:cover; border-radius:6px;">
                <div class="cart-item-info">
                    <h4>${item.title}</h4>
                    <span style="color: var(--primary); font-weight: bold;">${Number(item.price).toLocaleString()} BYN</span>
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