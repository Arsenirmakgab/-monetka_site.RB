// Инициализируем созданную базу данных Firebase Realtime Database
const firebaseConfig = {
    databaseURL: "https://monetka-market-default-rtdb.europe-west1.firebasedatabase.app/"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let products = [];
let cart = JSON.parse(localStorage.getItem('monetka_cart')) || [];
let currentCategory = 'all';
let isAdminMode = localStorage.getItem('monetka_admin') === 'true';
let uploadedImagesBase64 = []; 

document.addEventListener('DOMContentLoaded', () => {
    applyAdminUI();
    updateCartUI();
    listenToCloudProducts(); // Слушаем базу в реальном времени
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

// УМНАЯ СИНХРОНИЗАЦИЯ: Firebase сам обновляет экран при любых изменениях на сервере
function listenToCloudProducts() {
    db.ref('products').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            // Превращаем объект Firebase в массив и сортируем (новые сверху)
            products = Object.values(data).sort((a, b) => b.id - a.id);
        } else {
            products = [];
        }
        // Бекапим локально на всякий случай
        localStorage.setItem('monetka_products_backup', JSON.stringify(products));
        renderCategories();
        renderProducts();
    }, (error) => {
        console.log("Ошибка Firebase, работаем на локальном бекапе:", error);
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
        let pass = prompt("Введите пароль:");
        if (pass === "13579") {
            localStorage.setItem('monetka_admin', 'true');
            alert("Вход выполнен!");
            location.reload(); 
        } else if (pass !== null) {
            alert("Неверный пароль!");
        }
    }
}

function logoutAdmin() {
    if (confirm("Выйти?")) {
        localStorage.removeItem('monetka_admin');
        location.reload();
    }
}

function handleMultipleFiles(event) {
    const files = Array.from(event.target.files);
    if (uploadedImagesBase64.length + files.length > 3) {
        alert("Можно загрузить максимум 3 фото!");
        return;
    }

    files.forEach(file => {
        // Ужимаем лимит до 1.5МБ на картинку, Firebase это проглотит без проблем
        if (file.size > 1.5 * 1024 * 1024) {
            alert(`Файл ${file.name} слишком много весит (лимит 1.5МБ)! Попробуй сделать скриншот картинки или немного сжать.`);
            return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            uploadedImagesBase64.push(e.target.result);
            renderThumbnails();
        };
        reader.readAsDataURL(file);
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
    document.getElementById('admin-modal').style.display = 'flex';
}

function addNewProductFromSite() {
    const title = document.getElementById('admin-title').value.trim();
    const price = document.getElementById('admin-price').value;
    const category = document.getElementById('admin-category').value;
    const desc = document.getElementById('admin-desc').value.trim();

    if (!title || !price) {
        alert("Заполните поля!");
        return;
    }

    const productId = Date.now();
    const newProduct = {
        id: productId, 
        title: title,
        price: parseFloat(price),
        category: category,
        desc: desc || "Описание отсутствует.",
        images: [...uploadedImagesBase64] 
    };

    // Сохраняем в Firebase по уникальному ключу (id товара)
    db.ref('products/' + productId).set(newProduct)
    .then(() => {
        document.getElementById('admin-title').value = '';
        document.getElementById('admin-price').value = '';
        document.getElementById('admin-desc').value = '';
        uploadedImagesBase64 = [];
        closeModal('admin-modal');
        alert("✅ Товар успешно опубликован на всех устройствах!");
    })
    .catch((err) => {
        alert("Ошибка отправки в облако Firebase. Проверь размер фото.");
        console.error(err);
    });
}

function deleteProduct(id, event) {
    event.stopPropagation(); 
    if (confirm("Удалить этот товар? Он исчезнет со всех устройств.")) {
        db.ref('products/' + id).remove()
        .then(() => {
            console.log("Товар удален из Firebase");
        })
        .catch((err) => {
            alert("Не удалось удалить товар из облака");
        });
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

    return `
        <div class="product-slider" id="slider-${productId}" data-current="0" data-max="${imgs.length}">
            <div class="slider-track" id="track-${productId}">
                ${slidesHtml}
            </div>
            ${arrowsHtml}
        </div>
    `;
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

        const deleteButtonHtml = isAdminMode ? `
            <button class="delete-card-btn" onclick="deleteProduct(${prod.id}, event)">
                <i class="fa-solid fa-trash"></i>
            </button>` : '';
        
        const imagesList = prod.images ? Object.values(prod.images) : [];
        const coverPhoto = imagesList.length > 0 ? imagesList[0] : 'https://via.placeholder.com/150x200/1f293d/ffffff?text=📦';

        card.innerHTML = `
            <img src="${coverPhoto}" class="product-main-photo" loading="lazy">
            <div class="product-info">
                <div>
                    <div class="product-price">${Number(prod.price)} BYN</div>
                    <div class="product-title">${prod.title}</div>
                </div>
                <div class="card-actions-row">
                    <button class="card-btn" onclick="addToCart(${prod.id}, event)">
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

    const content = document.getElementById('modal-detail-content');
    const imagesList = prod.images ? Object.values(prod.images) : [];
    const modalSliderHtml = generateSliderHtml(prod.id + 9999, imagesList);

    content.innerHTML = `
        <div style="position:relative;">
            ${modalSliderHtml}
        </div>
        <div style="padding: 1.2rem;">
            <h2 style="font-size: 1.4rem; margin-bottom:0.2rem; color:#fff;">${prod.title}</h2>
            <p style="color: #1abc9c; font-size:0.85rem; margin-bottom: 1rem;">Категория: ${prod.category}</p>
            <div class="modal-price" style="font-size:1.6rem; color:var(--primary); font-weight:800; margin-bottom:1.2rem;">${Number(prod.price).toLocaleString()} BYN</div>
            <h3 style="margin-bottom: 0.4rem; font-size: 1rem; color:#fff;">Описание:</h3>
            <p style="color: var(--text-muted); line-height: 1.5; font-size:0.9rem;">${prod.desc}</p>
            <button class="card-btn" style="margin-top: 1.5rem; width:100%; padding:1rem; font-size: 0.9rem;" onclick="addToCart(${prod.id}, null); closeModal('product-detail-modal');">
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
    const activeSection = document.getElementById(`${tabName}-section`);
    if (activeSection) activeSection.style.display = 'block';

    const categoriesWrapper = document.getElementById('categories-wrapper');
    if (categoriesWrapper) {
        categoriesWrapper.style.display = tabName === 'shop' ? 'block' : 'none';
    }
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
        const imagesList = item.images ? Object.values(item.images) : [];
        const itemPhoto = imagesList.length > 0 ? imagesList[0] : 'https://via.placeholder.com/100x100/1f293d/ffffff?text=📦';
        return `
            <div class="cart-item">
                <img src="${itemPhoto}" style="width:50px; height:50px; object-fit:cover; border-radius:6px;">
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
