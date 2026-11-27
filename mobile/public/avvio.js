/* Tema e velo prima del primo disegno (index.html). Script classico, senza sintassi moderna. */
(function () {
  try {
    if (localStorage.getItem('mmf.mobile.tema') === 'dark') {
      document.documentElement.classList.add('dark');
      document.querySelector('meta[name="theme-color"]').setAttribute('content', '#050a0b');
    }
  } catch (e) {}
  try {
    if (sessionStorage.getItem('mmf.velo')) {
      sessionStorage.removeItem('mmf.velo');
      document.documentElement.classList.add('velo');
      // Mai un velo che resta: al più tardi sparisce dopo 8 secondi
      setTimeout(function () { document.documentElement.classList.remove('velo'); }, 8000);
    }
  } catch (e) {}
})();
