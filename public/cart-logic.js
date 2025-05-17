// cart-logic.js

// ###################################################################################
// # IMPORTANT ACTION REQUIRED:                                                      #
// # Replace 'YOUR_LIVE_BACKEND_API_URL_HERE/api' with the actual public URL         #
// # of your deployed Node.js backend on Hostinger.                                  #
// # Example: const API_BASE_URL_CART = 'https://brown-echidna-862242.hostingersite.com/api'; #
// ###################################################################################
const API_BASE_URL_CART = 'YOUR_LIVE_BACKEND_API_URL_HERE/api'; // <<< YOU MUST CHANGE THIS LINE

const LOCAL_STORAGE_CART_KEY_SHARED = 'rcanBakesCart';

/**
 * Displays a temporary notification message.
 */
function showSharedNotification(message, type = 'success', areaId = 'notification-area') {
    const notificationArea = document.getElementById(areaId);
    if (!notificationArea) {
        console.warn('Notification area not found:', areaId, ". Falling back to alert.");
        alert(`${type.toUpperCase()}: ${message}`);
        return;
    }
    const notification = document.createElement('div');
    let bgColorClass = 'bg-green-500';
    if (type === 'error') bgColorClass = 'bg-red-500';
    else if (type === 'info') bgColorClass = 'bg-blue-500';
    else if (type === 'warning') bgColorClass = 'bg-yellow-500 text-gray-800';

    notification.className = `p-4 mb-3 rounded-lg shadow-lg text-white ${bgColorClass} transition-opacity duration-300 ease-out opacity-0`;
    notification.textContent = message;
    notificationArea.appendChild(notification);
    setTimeout(() => notification.style.opacity = '1', 10);
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 350);
    }, 3000);
}

/**
 * Retrieves the cart object from localStorage.
 */
function getSharedCart() {
    const cartJson = localStorage.getItem(LOCAL_STORAGE_CART_KEY_SHARED);
    try {
        return cartJson ? JSON.parse(cartJson) : {};
    } catch (e) {
        console.error("Error parsing cart from localStorage:", e);
        return {};
    }
}

/**
 * Saves the cart object to localStorage and updates UI.
 */
function saveSharedCart(cart) {
    try {
        localStorage.setItem(LOCAL_STORAGE_CART_KEY_SHARED, JSON.stringify(cart));
    } catch (e) {
        console.error("Error saving cart to localStorage:", e);
        showSharedNotification("Could not save cart. Storage might be full.", "error");
    }
    updateSharedCartCountDisplay();
    if (typeof renderCartPage === 'function' && window.location.pathname.includes('cart.html')) {
        renderCartPage();
    }
}

/**
 * Calculates total items in cart.
 */
function calculateTotalSharedCartItems() {
    const cart = getSharedCart();
    return Object.values(cart).reduce((total, item) => total + (item.quantity || 0), 0);
}

/**
 * Updates cart item count display in navigation.
 */
function updateSharedCartCountDisplay() {
    const totalItems = calculateTotalSharedCartItems();
    const cartNavElem = document.getElementById('cart-item-count-nav');
    const cartMobileNavElem = document.getElementById('cart-item-count-mobile-nav');
    if (cartNavElem) cartNavElem.textContent = `(${totalItems})`;
    if (cartMobileNavElem) cartMobileNavElem.textContent = totalItems;
}

/**
 * Adds an item to cart, validating stock with backend.
 */
async function addItemToSharedCart(product, quantityToAdd = 1) {
    if (!product || !product.id || !product.name || typeof product.price !== 'number') {
        showSharedNotification('Product data incomplete. Cannot add.', 'error');
        return;
    }
    if (isNaN(quantityToAdd) || quantityToAdd < 1) {
        showSharedNotification('Invalid quantity.', 'error');
        return;
    }

    const cart = getSharedCart();
    const currentQuantityInCart = cart[product.id] ? cart[product.id].quantity : 0;
    
    try {
        const response = await fetch(`${API_BASE_URL_CART}/cart/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: product.id, quantity: quantityToAdd }) // productId is custom_id
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
            // Handle specific backend messages (e.g., out of stock, limited stock)
            showSharedNotification(result.message || "Could not add item. Server error.", 'error');
            if (result.message && result.message.toLowerCase().includes("out of stock")) {
                // Optionally disable add to cart button or update UI to reflect out of stock
            }
            return; // Stop if stock validation fails or error occurs
        }

        // If stock check is successful, or partially successful (limited stock message from backend)
        let actualQuantityAdded = quantityToAdd;
        if (result.message && result.message.toLowerCase().includes("limited stock")) {
            // If backend indicates limited stock, it should ideally tell us how much *can* be added
            // For now, we assume if it's a success, the quantityToAdd is okay, or backend message is a warning.
            // A more robust approach: backend returns exactly how many were added or available.
            // Based on current server.js /api/cart/add, if success is true, it means requested quantity is okay OR
            // it's a warning about limited stock but still allows adding up to available.
            if (result.availableStock !== undefined && (currentQuantityInCart + quantityToAdd) > result.availableStock) {
                 actualQuantityAdded = Math.max(0, result.availableStock - currentQuantityInCart);
                 if (actualQuantityAdded > 0) {
                    showSharedNotification(`Limited stock. Added ${actualQuantityAdded} of ${product.name}.`, 'warning');
                 } else {
                    showSharedNotification(`No more ${product.name} can be added. Max stock reached.`, 'info');
                    return; // Nothing to add
                 }
            } else {
                 showSharedNotification(result.message || `${product.name} (x${quantityToAdd}) added to cart!`, 'success');
            }
        } else {
            showSharedNotification(result.message || `${product.name} (x${quantityToAdd}) added to cart!`, 'success');
        }
        
        const newTotalQuantity = currentQuantityInCart + actualQuantityAdded;

        if (actualQuantityAdded > 0) {
            cart[product.id] = {
                id: product.id,
                name: product.name,
                price: parseFloat(product.price),
                imageUrl: product.imageUrl || `https://placehold.co/100x80/FFFDD0/7B3F00?text=${encodeURIComponent(product.name)}`,
                priceUnit: product.priceUnit || 'each',
                quantity: newTotalQuantity
            };
            saveSharedCart(cart);
        }

    } catch (error) {
        console.error('Error adding item to cart / validating stock:', error);
        showSharedNotification('Error adding item. Could not connect to server.', 'error');
    }
}

// Initial check for API_BASE_URL_CART configuration
console.log('cart-logic.js loaded. API Base URL:', API_BASE_URL_CART);
if (API_BASE_URL_CART === 'YOUR_LIVE_BACKEND_API_URL_HERE/api' || (API_BASE_URL_CART && API_BASE_URL_CART.includes('localhost'))) {
    const warningMsg = 'CRITICAL WARNING: API_BASE_URL_CART in cart-logic.js needs to be updated to your live backend URL for the site to function correctly on Hostinger.';
    console.warn(warningMsg);
    // Try to show this on pages that might have an error display area
    if (typeof document !== 'undefined' && (window.location.pathname.includes('cookies.html') || window.location.pathname.includes('admin-'))) {
        const errorArea = document.getElementById('error-message-area') || document.getElementById('notification-area');
        if (errorArea) {
            const p = document.createElement('p');
            p.innerHTML = `<strong>Configuration Alert:</strong> ${warningMsg}`;
            p.style.color = 'red'; p.style.backgroundColor = 'yellow'; p.style.padding = '10px'; p.style.textAlign = 'center';
            if (errorArea.firstChild) errorArea.insertBefore(p, errorArea.firstChild);
            else errorArea.appendChild(p);
            if(document.getElementById('loading-indicator')) document.getElementById('loading-indicator').classList.add('hidden');
        }
    }
}
// Call on DOMContentLoaded in each HTML file
// document.addEventListener('DOMContentLoaded', () => { updateSharedCartCountDisplay(); });
