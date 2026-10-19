require("dotenv").config();

const express = require("express");
const session = require("express-session");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, "applications.json");

if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) {
    console.error(".env file mein password ya secret missing hai.");
    process.exit(1);
}

app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false }));

app.use(session({
    name: "dsc_admin_session",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "strict",
        secure: false,
        maxAge: 30 * 60 * 1000
    }
}));

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]", "utf8");
}

function readApplications() {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

function saveApplications(applications) {
    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(applications, null, 2),
        "utf8"
    );
}

function isAdmin(req, res, next) {
    if (req.session && req.session.admin === true) {
        return next();
    }

    return res.status(401).json({
        success: false,
        message: "Pehle Admin Login karein."
    });
}

function safeCompare(a, b) {
    const first = Buffer.from(a);
    const second = Buffer.from(b);

    if (first.length !== second.length) {
        return false;
    }

    return crypto.timingSafeEqual(first, second);
}

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "admin.html"));
});

app.post("/api/applications", (req, res) => {
    const name = String(req.body.name || "").trim();
    const mobile = String(req.body.mobile || "").trim();
    const service = String(req.body.service || "").trim();
    const details = String(req.body.details || "").trim();

    if (
        !name ||
        name.length > 100 ||
        !/^[0-9]{10}$/.test(mobile) ||
        !service ||
        service.length > 100 ||
        details.length > 1000
    ) {
        return res.status(400).json({
            success: false,
            message: "Sahi jankari bharein."
        });
    }

    const applications = readApplications();

    const application = {
        id: crypto.randomUUID(),
        applicationNumber: "DSC-" + Date.now().toString().slice(-8),
        name,
        mobile,
        service,
        details,
        status: "Pending",
        createdAt: new Date().toISOString()
    };

    applications.push(application);
    saveApplications(applications);

    res.status(201).json({
        success: true,
        applicationNumber: application.applicationNumber,
        message: "Aavedan save ho gaya."
    });
});

app.post("/api/admin/login", (req, res, next) => {
    const password = String(req.body.password || "");

    if (!safeCompare(password, process.env.ADMIN_PASSWORD)) {
        return res.status(401).json({
            success: false,
            message: "Password galat hai."
        });
    }

    req.session.regenerate((err) => {
        if (err) return next(err);

        req.session.admin = true;

        req.session.save((saveErr) => {
            if (saveErr) return next(saveErr);

            res.json({
                success: true,
                message: "Login successful."
            });
        });
    });
});

app.post("/api/admin/logout", isAdmin, (req, res) => {
    req.session.destroy(() => {
        res.clearCookie("dsc_admin_session");
        res.json({ success: true });
    });
});

app.get("/api/admin/applications", isAdmin, (req, res) => {
    res.json(readApplications());
});

app.patch(
    "/api/admin/applications/:id/status",
    isAdmin,
    (req, res) => {
        const allowedStatuses = [
            "Pending",
            "Processing",
            "Completed",
            "Rejected"
        ];

        const status = String(req.body.status || "");

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Status sahi nahi hai."
            });
        }

        const applications = readApplications();
        const application = applications.find(
            item => item.id === req.params.id
        );

        if (!application) {
            return res.status(404).json({
                success: false,
                message: "Aavedan nahi mila."
            });
        }

        application.status = status;
        saveApplications(applications);

        res.json({
            success: true,
            message: "Status update ho gaya."
        });
    }
);

app.get("/api/health", (req, res) => {
    res.json({ running: true });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log("Digital Seva Connect chalu hai!");
    console.log(`Website: http://127.0.0.1:${PORT}`);
    console.log(`Admin Panel: http://127.0.0.1:${PORT}/admin`);
});