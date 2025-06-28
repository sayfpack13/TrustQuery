# TrustQuery

**A Scalable Search and Data Management Engine**

![Project Screenshot](/frontend/public/favicon.png)

## 🚀 About the Project

TrustQuery is a scalable and fast search engine designed to allow administrators and moderators to manage and search through large datasets of any type. It provides a robust administrative dashboard for data management and a powerful search interface to handle high-volume queries efficiently.

**This project is a technical demonstration of a high-performance search and data management solution.**

## ✨ Features

* **Admin Dashboard:** A secure, password-protected interface for administrators to:
    * Upload new data files.
    * Parse raw data and index it into Elasticsearch.
    * Manage and view the status of pending, unparsed, and parsed files.
    * View, edit, or delete individual records.
* **Public Search:** A user-friendly interface to search for data, intended for demonstration or controlled access.
* **Dynamic Data Masking:** Data can be dynamically masked for display purposes.
* **JWT-based Authentication:** Secure admin access using JSON Web Tokens.
* **Environment-based Configuration:** All sensitive information and configurable variables are managed securely through a `.env` file.
* **Informational Pages:** Includes a Privacy Policy, Terms of Service, and Disclaimer.
* **Interactive Globe Visualization:** A visually engaging globe on the homepage to represent the indexed data.

## 🛠️ Tech Stack

**Frontend:**
* **React:** A JavaScript library for building user interfaces.
* **Tailwind CSS:** A utility-first CSS framework for styling.
* **React Router:** For navigation between pages.
* **`react-globe.gl`:** For the interactive 3D globe visualization.
* **Font Awesome:** For icons.
* **`axios`:** For API requests.

**Backend:**
* **Node.js & Express.js:** A robust JavaScript runtime and web framework.
* **Elasticsearch:** A powerful search and analytics engine used as the data store.
* **`jsonwebtoken`:** For handling JWT-based authentication.
* **`dotenv`:** To manage environment variables.
* **`multer`:** To handle file uploads.
* **`cors`:** For enabling Cross-Origin Resource Sharing.

## 📦 Getting Started

Follow these steps to set up and run the project on your local machine.

### Prerequisites

* [**Node.js**](https://nodejs.org/) (v14 or higher)
* [**npm**](https://www.npmjs.com/) (comes with Node.js)
* [**Git**](https://git-scm.com/)
* [**Elasticsearch**](https://www.elastic.co/downloads/elasticsearch) (v7.x recommended)

### Installation

#### 1. Clone the repository

```bash
git clone <your-repo-url>
cd trustquery