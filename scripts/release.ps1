<#
.SYNOPSIS
    Pubblica una nuova versione di MyMedicalFlow.

.DESCRIPTION
    Allinea la versione nei quattro punti in cui compare, esegue le verifiche,
    crea il commit e il tag, e lo invia: il tag fa partire la pipeline di
    release su GitHub Actions.

    Le verifiche girano PRIMA del tag: un tag inviato è pubblico e far fallire
    la pipeline costringerebbe a cancellarlo e rifarlo.

.PARAMETER Versione
    Nuova versione in formato SemVer, senza la "v" iniziale (es. 0.3.1).
    Se omessa, viene proposta la patch successiva.

.PARAMETER SoloVerifica
    Esegue tutto tranne commit, tag e push. Utile per provare senza rischi.

.PARAMETER SenzaConferma
    Salta la richiesta di conferma prima del push.

.EXAMPLE
    .\scripts\release.ps1 0.3.1
.EXAMPLE
    .\scripts\release.ps1 -SoloVerifica
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Versione,
    [switch]$SoloVerifica,
    [switch]$SenzaConferma
)

$ErrorActionPreference = 'Stop'

# ─── Utilità ──────────────────────────────────────────────────────────────────

function Scrivi-Passo($testo) { Write-Host "`n▶ $testo" -ForegroundColor Cyan }
function Scrivi-Ok($testo) { Write-Host "  ✓ $testo" -ForegroundColor Green }
function Scrivi-Avviso($testo) { Write-Host "  ! $testo" -ForegroundColor Yellow }
function Interrompi($testo) { Write-Host "`n✗ $testo`n" -ForegroundColor Red; exit 1 }

# Scrive senza BOM: PowerShell lo aggiunge di default e rende package.json
# illeggibile ai parser JSON (errore già capitato una volta).
function Scrivi-SenzaBom($percorso, $contenuto) {
    [System.IO.File]::WriteAllText($percorso, $contenuto, (New-Object System.Text.UTF8Encoding $false))
}

# Sostituisce solo la PRIMA occorrenza, per non toccare le versioni delle dipendenze
function Sostituisci-Prima($testo, $modello, $sostituto) {
    $rx = [regex]$modello
    return $rx.Replace($testo, $sostituto, 1)
}

# ─── Posizionamento ───────────────────────────────────────────────────────────

$radice = Split-Path -Parent $PSScriptRoot
Set-Location $radice

$fPackage = Join-Path $radice 'package.json'
$fCargo = Join-Path $radice 'src-tauri\Cargo.toml'
$fTauri = Join-Path $radice 'src-tauri\tauri.conf.json'

foreach ($f in @($fPackage, $fCargo, $fTauri)) {
    if (-not (Test-Path $f)) { Interrompi "File non trovato: $f. Lo script va eseguito dentro il repository." }
}

Write-Host "`n=== Release MyMedicalFlow ===" -ForegroundColor White

# ─── 1. Controlli preliminari ─────────────────────────────────────────────────

Scrivi-Passo 'Controlli preliminari'

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne 'main') {
    Scrivi-Avviso "Sei sul branch '$branch', non su 'main'."
    if (-not $SenzaConferma) {
        $r = Read-Host '  Continuare comunque? (s/N)'
        if ($r -ne 's') { Interrompi 'Interrotto.' }
    }
} else {
    Scrivi-Ok "Branch: main"
}

if ((git status --porcelain).Length -gt 0) {
    git status --short
    Interrompi 'Ci sono modifiche non committate. Committale o annullale prima di rilasciare.'
}
Scrivi-Ok 'Nessuna modifica in sospeso'

$versioneAttuale = (Get-Content $fPackage -Raw | ConvertFrom-Json).version
Scrivi-Ok "Versione attuale: $versioneAttuale"

# ─── 2. Nuova versione ────────────────────────────────────────────────────────

if (-not $Versione) {
    $parti = $versioneAttuale -split '\.'
    $proposta = "$($parti[0]).$($parti[1]).$([int]$parti[2] + 1)"
    $Versione = Read-Host "  Nuova versione [$proposta]"
    if (-not $Versione) { $Versione = $proposta }
}

$Versione = $Versione.TrimStart('v')
if ($Versione -notmatch '^\d+\.\d+\.\d+$') {
    Interrompi "Versione '$Versione' non valida. Attesa in formato SemVer, es. 0.3.1"
}
if ($Versione -eq $versioneAttuale) {
    Interrompi "La versione $Versione è già quella attuale."
}

$tag = "v$Versione"
if ((git tag --list $tag)) { Interrompi "Il tag $tag esiste già in locale." }
if ((git ls-remote --tags origin $tag) -match $tag) { Interrompi "Il tag $tag esiste già sul remote." }
Scrivi-Ok "Nuova versione: $Versione  (tag $tag)"

# ─── 3. Allineamento delle versioni ───────────────────────────────────────────

Scrivi-Passo 'Allineamento versioni'

# package.json + package-lock.json in un colpo solo, senza toccare git
npm version $Versione --no-git-tag-version --allow-same-version | Out-Null
if ($LASTEXITCODE -ne 0) { Interrompi 'npm version non riuscito.' }
Scrivi-Ok 'package.json e package-lock.json'

# Cargo.toml: solo la versione del pacchetto, non quelle delle dipendenze
$testoCargo = Get-Content $fCargo -Raw
$testoCargo = Sostituisci-Prima $testoCargo '(?m)^version\s*=\s*"[^"]+"' "version = `"$Versione`""
Scrivi-SenzaBom $fCargo $testoCargo
Scrivi-Ok 'src-tauri/Cargo.toml'

# tauri.conf.json: la prima occorrenza è la versione dell'app
$testoTauri = Get-Content $fTauri -Raw
$testoTauri = Sostituisci-Prima $testoTauri '"version"\s*:\s*"[^"]+"' "`"version`": `"$Versione`""
Scrivi-SenzaBom $fTauri $testoTauri
Scrivi-Ok 'src-tauri/tauri.conf.json'

# Cargo.lock viene riallineato dal primo comando cargo (i test più avanti)

# ─── 4. Verifiche ─────────────────────────────────────────────────────────────

Scrivi-Passo 'Verifiche (prima del tag, così un errore non lascia tag pubblici)'

npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { Interrompi 'Typecheck fallito.' }
Scrivi-Ok 'Typecheck TypeScript'

npm run build 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Interrompi 'Build del frontend fallita.' }
Scrivi-Ok 'Build frontend'

cargo test --manifest-path src-tauri/Cargo.toml --lib
if ($LASTEXITCODE -ne 0) { Interrompi 'Test Rust falliti.' }
Scrivi-Ok 'Test Rust'

# `npm ci` in pipeline rifiuta package.json e lockfile disallineati
npm ci --dry-run 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Interrompi 'package.json e package-lock.json non sono coerenti.' }
Scrivi-Ok 'Coerenza lockfile (npm ci)'

# ─── 5. Coerenza finale delle quattro versioni ────────────────────────────────

Scrivi-Passo 'Coerenza delle versioni'

$trovate = [ordered]@{
    'package.json'           = (Get-Content $fPackage -Raw | ConvertFrom-Json).version
    'package-lock.json'      = (Get-Content (Join-Path $radice 'package-lock.json') -Raw | ConvertFrom-Json).version
    'src-tauri/Cargo.toml'   = ([regex]::Match((Get-Content $fCargo -Raw), '(?m)^version\s*=\s*"([^"]+)"').Groups[1].Value)
    'src-tauri/tauri.conf.json' = ([regex]::Match((Get-Content $fTauri -Raw), '"version"\s*:\s*"([^"]+)"').Groups[1].Value)
}
$trovate.GetEnumerator() | ForEach-Object { Write-Host ("  {0,-28} {1}" -f $_.Key, $_.Value) }

$diverse = $trovate.Values | Where-Object { $_ -ne $Versione }
if ($diverse) { Interrompi "Le versioni non coincidono tutte con $Versione." }
Scrivi-Ok "Tutte allineate a $Versione"

if ($SoloVerifica) {
    Write-Host "`n── Modalità SoloVerifica: nessun commit, tag o push. ──" -ForegroundColor Yellow
    Write-Host "   I file sono stati modificati: usa 'git checkout -- .' per annullare.`n"
    exit 0
}

# ─── 6. Conferma ──────────────────────────────────────────────────────────────

if (-not $SenzaConferma) {
    Write-Host "`n  Verrà creato e inviato il tag $tag." -ForegroundColor Yellow
    Write-Host "  Questo avvia la build pubblica su GitHub Actions." -ForegroundColor Yellow
    $r = Read-Host "  Procedere? (s/N)"
    if ($r -ne 's') {
        Write-Host "`n  Annullato. I file restano modificati: 'git checkout -- .' per ripristinarli.`n"
        exit 0
    }
}

# ─── 7. Commit, tag, push ─────────────────────────────────────────────────────

Scrivi-Passo 'Pubblicazione'

git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "Versione $Versione" | Out-Null
if ($LASTEXITCODE -ne 0) { Interrompi 'Commit non riuscito.' }
Scrivi-Ok "Commit: Versione $Versione"

git tag $tag
if ($LASTEXITCODE -ne 0) { Interrompi 'Creazione del tag non riuscita.' }
Scrivi-Ok "Tag $tag creato"

git push
if ($LASTEXITCODE -ne 0) { Interrompi "Push del branch non riuscito. Il tag $tag esiste solo in locale." }
Scrivi-Ok 'Branch inviato'

git push origin $tag
if ($LASTEXITCODE -ne 0) { Interrompi "Push del tag non riuscito. Riprova con: git push origin $tag" }
Scrivi-Ok "Tag inviato — la pipeline è partita"

# ─── 8. Cosa fare adesso ──────────────────────────────────────────────────────

Write-Host "`n=== Fatto ===" -ForegroundColor White
Write-Host @"

  Segui la build:
    https://github.com/zhakor/mymedicalflow/actions

  Al termine troverai una release in BOZZA:
    https://github.com/zhakor/mymedicalflow/releases

  Prima di pubblicarla:
    1. scrivi le novità (finiscono nella finestra di aggiornamento dentro l'app)
    2. verifica che ci siano latest.json e i file .sig
    3. premi "Publish release"

  Finché resta in bozza, nessun utente riceve l'aggiornamento.

"@
