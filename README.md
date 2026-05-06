# LoopTube

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-1.0.1-green.svg)
![Platform](https://img.shields.io/badge/platform-Firefox-lightgrey)
![Support](https://img.shields.io/badge/support-Desktop%20%2B%20Mobile-orange)

A lightweight browser extension that adds a loop button directly inside the YouTube video player.

---

<p align="center">
  <img src="assets/screenshot.png" alt="LoopTube Demo" width="700">
</p>

---

## Overview

LoopTube integrates a loop control directly into the YouTube player, allowing videos to repeat without leaving the interface.

Designed to feel native, lightweight, and unobtrusive across both desktop and mobile layouts.

---

## Features

* Loop button integrated into the YouTube player controls
* Toggle loop with a single click
* Keyboard shortcut (**L**) on desktop
* Mobile YouTube player support
* Remembers loop state per video
* Works with autoplay and navigation
* Handles YouTube’s dynamic UI reliably
* Controls appear and disappear naturally with YouTube UI

---

## Installation

### Firefox Add-ons

Available on the Firefox Add-ons store.

### Manual Installation

1. Clone or download this repository
2. Open your browser’s extensions page
3. Enable Developer Mode
4. Load the extension folder

---

## Privacy

LoopTube does not collect, store, or transmit any user data.

All functionality runs locally within the browser.

---

## Permissions

* `storage` — used only to save loop preferences locally

---

## Compatibility

* Desktop YouTube (`www.youtube.com`)
* Mobile YouTube interface
* Firefox

---

## Project Structure

```text
looptube/
├── manifest.json
├── content.js
├── popup.html
├── popup.js
├── style.css
├── icons/
└── assets/