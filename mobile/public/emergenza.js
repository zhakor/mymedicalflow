/* Schermata d'emergenza se l'app non parte (index.html). Script classico, senza sintassi moderna. */
(function () {
  var errori = [];
  function testo() {
    return errori.join('\n\n') + '\n\nPagina: ' + location.href + '\n' + navigator.userAgent;
  }
  function mostra() {
    var esistente = document.getElementById('emergenza-dettagli');
    if (esistente) { esistente.textContent = testo(); return; }
    var box = document.createElement('div');
    box.id = 'emergenza';
    box.setAttribute('role', 'alert');
    box.innerHTML =
      '<div class="scatola">' +
        '<div class="marchio"><img src="/favicon.svg" alt="">MyMedicalFlow</div>' +
        '<div class="scheda">' +
          '<div class="simbolo">!</div>' +
          '<h1>L’app non riesce ad avviarsi</h1>' +
          '<p>Non è stato possibile caricare MyMedicalFlow. Spesso basta riprovare: controlla la connessione e ricarica.</p>' +
          '<button class="primario" id="emergenza-riprova">Riprova</button>' +
          '<button class="secondario" id="emergenza-copia">Copia i dettagli per l’assistenza</button>' +
          '<details><summary>Dettagli tecnici</summary><pre id="emergenza-dettagli"></pre></details>' +
        '</div>' +
      '</div>';
    document.body.appendChild(box);
    document.getElementById('emergenza-dettagli').textContent = testo();
    document.getElementById('emergenza-riprova').onclick = function () { location.reload(); };
    document.getElementById('emergenza-copia').onclick = function () {
      var bottone = this;
      function fatto() { bottone.textContent = 'Copiato'; }
      if (navigator.clipboard) navigator.clipboard.writeText(testo()).then(fatto, function () {});
      box.querySelector('details').open = true;
    };
  }
  window.addEventListener('error', function (e) {
    // Ad app avviata se ne occupa la pagina d'errore dell'app
    if (window.__mmfAvviata) return;
    var t = e.target;
    if (t && t !== window && (t.src || t.href)) errori.push('Risorsa non caricata: ' + (t.src || t.href));
    else errori.push((e.message || 'Errore') + (e.filename ? '\n' + e.filename + ':' + e.lineno + ':' + e.colno : ''));
    mostra();
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    if (window.__mmfAvviata) return;
    errori.push('Promessa rifiutata: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason));
    mostra();
  });
  // Nessun errore ma l'app non è partita dopo 10 secondi
  setTimeout(function () {
    if (window.__mmfAvviata) return;
    errori.push('Avvio non completato dopo 10 secondi.\nContesto sicuro: ' + window.isSecureContext + '\nWebCrypto: ' + !!(window.crypto && window.crypto.subtle));
    mostra();
  }, 10000);
})();
