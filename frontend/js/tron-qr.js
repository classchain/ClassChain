/** @deprecated use payment-qr.js — thin redirect for compatibility */
(function () {
  var s = document.createElement('script');
  s.src = 'js/payment-qr.js';
  s.async = false;
  document.head.appendChild(s);
})();
