# Pubblica la PWA (modalità Google) su Vercel: https://mymedicalflow-mobile.vercel.app
#
# Serve l'accesso alla CLI di Vercel (`npx vercel login`, una volta sola) e il
# file .env.local nella radice con la configurazione Firebase e i client OAuth:
# i valori VITE_* finiscono nel JavaScript pubblicato, il secret del desktop no.
#
# Il progetto si indica per id: `mobile/dist` si svuota a ogni build, quindi il
# collegamento creato da `vercel link` non sopravvivrebbe.

$ErrorActionPreference = 'Stop'
$env:VERCEL_ORG_ID = 'team_Ntof5OYeWnhHrHWNdbNvLl9m'
$env:VERCEL_PROJECT_ID = 'prj_328hEaDIC21JeTo9sFOgo4BDC4eE'

Set-Location (Join-Path $PSScriptRoot '..')
npm run mobile:build:google
if ($LASTEXITCODE -ne 0) { throw 'Build della PWA non riuscita.' }

npx vercel deploy mobile/dist --prod --yes
if ($LASTEXITCODE -ne 0) { throw 'Pubblicazione su Vercel non riuscita.' }
