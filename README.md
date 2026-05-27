# Antenna Visualization & Analysis Laboratory

This project is a comprehensive web-based interactive platform designed for the electromagnetic analysis and visualization of antenna radiation patterns. It provides engineering students and researchers with a powerful toolkit to design, simulate, and analyze complex antenna configurations in a user-friendly environment.

## Live Demo
You can view the project live here:
**[View Project Online](https://antenna-radiation-visualizer.vercel.app/)**

---

## Operational Modes
The application offers a professional simulation environment with flexible configuration modes:

* **Single Element:** Ideal for analyzing the radiation characteristics of a standalone antenna.
* **2D Array & 3D Array:** A powerful engine that supports **Linear, Circular, Rectangular, and Triangular** arrays.
    * **Configurable Parameters:** Users have full control over:
        * **Frequency:** Set the precise operating frequency for antenna elements.
        * **Element Spacing:** Define the distance between elements to optimize array gain and beamforming.
        * **Array Geometry:** Configure the number of elements and layers in 3D space to simulate complex volumetric configurations.
* **Manual Mode:** Offers full creative freedom. Users can place antennas at precise coordinates. 
    * **Features:** Add or delete individual elements, define custom layouts, and ensure accuracy with real-time verification against established electromagnetic libraries.

---

## Simulation & Intelligence
* **Run Simulation:** Configure your antenna layout and click "Run Simulation" to generate radiation patterns immediately. Scroll down on the left to see "Run Simulation" button.
* **Mathematical Insights:** The application calculates and displays the **final pattern formula**, providing users with a deep understanding of the mathematical relationship of the radiation.
* **AI-Powered Chatbot:** Our chatbot utilizes a **RAG (Retrieval-Augmented Generation)** architecture integrated with the **Google Gemini API**. By retrieving context-aware data related to antenna theory and your specific simulation parameters, the AI provides highly accurate, technical insights and troubleshooting assistance, rather than just generic responses.

---

## User Experience & UI Features
* **Realistic Visualization:** Antenna elements are designed to resemble real-world hardware, providing an intuitive visual experience.
* **Viewport Controls:** * **Rotate:** Use Left-Click to rotate the 3D scene.
    * **Pan:** Use Right-Click to move the camera.
    * **Zoom:** Use the Mouse Scroll wheel to focus on details.
* **Themes:** Toggle between **Dark and Light modes** to match your preferred working environment.

---

## System Features
* **Authentication:** Secure Login/Signup portal powered by **Firebase Authentication**.
* **Project Library:** Save your simulation designs, configurations, and results to your private Library for future access and modification.

---

## Tech Stack
* **Frontend:** React, TypeScript, Vite.
* **UI/UX:** Tailwind CSS for a modern, responsive design.
* **Backend:** Firebase Authentication for secure user management.
* **AI Services:** Google Gemini API for analytical support and troubleshooting.
* **Deployment:** Hosted on Vercel for fast and reliable access.

---

## Project Purpose
This laboratory tool bridges the gap between theoretical electromagnetics and practical application. By combining high-fidelity visualization with AI-driven insights, it serves as an effective educational aid for electromagnetic courses.

---

## Credits
Developed as an educational project for the "Applied AI Engineering course".
