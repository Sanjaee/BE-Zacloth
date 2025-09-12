const rateLimit = require("express-rate-limit");
const helmet = require("helmet");

// Rate limiting for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    success: false,
    message: "Too many login attempts, please try again later",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
});

// Rate limiting for general API requests
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: "Too many requests, please try again later",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for user generation (admin only)
const userGenerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 user generations per hour
  message: {
    success: false,
    message: "Too many user generation attempts, please try again later",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Security headers middleware
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      process.env.FRONTEND_URL || "https://zacloth.com",
      "https://www.zacloth.com",
    ];

    // In development, be more permissive
    if (
      process.env.NODE_ENV === "development" ||
      process.env.NODE_ENV !== "production"
    ) {
      // Allow localhost with any port in development
      if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
        return callback(null, true);
      }
      // Temporary: Allow all origins in development (remove in production)
      console.log("Development mode: allowing origin:", origin);
      return callback(null, true);
    }

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log("CORS blocked origin:", origin);
      console.log("Allowed origins:", allowedOrigins);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "Cache-Control",
    "Pragma",
  ],
  exposedHeaders: ["X-Total-Count"],
  maxAge: 86400, // 24 hours
};

// Request validation middleware
const validateRequest = (req, res, next) => {
  // Check for suspicious patterns
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /union\s+select/i,
    /drop\s+table/i,
    /delete\s+from/i,
    /insert\s+into/i,
    /update\s+set/i,
  ];

  const bodyString = JSON.stringify(req.body);
  const queryString = JSON.stringify(req.query);
  const paramsString = JSON.stringify(req.params);

  for (const pattern of suspiciousPatterns) {
    if (
      pattern.test(bodyString) ||
      pattern.test(queryString) ||
      pattern.test(paramsString)
    ) {
      return res.status(400).json({
        success: false,
        message: "Suspicious request detected",
        code: "SUSPICIOUS_REQUEST",
      });
    }
  }

  next();
};

// IP whitelist middleware (optional - for admin routes)
const ipWhitelist = (allowedIPs = []) => {
  return (req, res, next) => {
    if (allowedIPs.length === 0) {
      return next(); // No whitelist configured
    }

    const clientIP = req.ip || req.connection.remoteAddress;

    if (allowedIPs.includes(clientIP)) {
      next();
    } else {
      res.status(403).json({
        success: false,
        message: "Access denied from this IP address",
        code: "IP_NOT_ALLOWED",
      });
    }
  };
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      timestamp: new Date().toISOString(),
    };

    // Log only errors and slow requests
    if (res.statusCode >= 400 || duration > 1000) {
      console.log("Request:", JSON.stringify(logData));
    }
  });

  next();
};

// Web application only middleware - prevents external access
const webAppOnly = (req, res, next) => {
  const userAgent = req.get("User-Agent") || "";
  const referer = req.get("Referer") || "";
  const origin = req.get("Origin") || "";

  // Block common external tools
  const blockedUserAgents = [
    /postman/i,
    /insomnia/i,
    /curl/i,
    /wget/i,
    /httpie/i,
    /restclient/i,
    /apideveloper/i,
    /api-tester/i,
    /thunder\s*client/i,
    /paw/i,
    /advanced\s*rest\s*client/i,
    /rest\s*assured/i,
    /newman/i,
    /swagger/i,
    /openapi/i,
    /rapidapi/i,
    /apigee/i,
    /kong/i,
    /nginx/i,
    /apache/i,
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
  ];

  // Check if user agent is blocked
  const isBlockedUserAgent = blockedUserAgents.some((pattern) =>
    pattern.test(userAgent)
  );

  if (isBlockedUserAgent) {
    console.log("Blocked external tool access:", {
      userAgent,
      ip: req.ip,
      url: req.url,
      timestamp: new Date().toISOString(),
    });

    return res.status(403).json({
      success: false,
      message:
        "Access denied. This endpoint is only accessible from the web application.",
      code: "EXTERNAL_ACCESS_DENIED",
    });
  }

  // In production, also check referer and origin
  if (process.env.NODE_ENV === "production") {
    const allowedOrigins = [
      process.env.FRONTEND_URL || "https://zacloth.com",
      "https://www.zacloth.com",
    ];

    const isAllowedOrigin = allowedOrigins.some(
      (allowedOrigin) =>
        origin.includes(allowedOrigin) || referer.includes(allowedOrigin)
    );

    if (!isAllowedOrigin && origin && referer) {
      console.log("Blocked external origin/referer:", {
        origin,
        referer,
        ip: req.ip,
        url: req.url,
        timestamp: new Date().toISOString(),
      });

      return res.status(403).json({
        success: false,
        message: "Access denied. Invalid origin or referer.",
        code: "INVALID_ORIGIN",
      });
    }
  }

  // Additional security: Check for required headers that browsers send
  const requiredHeaders = ["Accept", "Accept-Language"];
  const missingHeaders = requiredHeaders.filter((header) => !req.get(header));

  if (missingHeaders.length > 0) {
    console.log("Missing required headers:", {
      missingHeaders,
      userAgent,
      ip: req.ip,
      url: req.url,
      timestamp: new Date().toISOString(),
    });

    return res.status(403).json({
      success: false,
      message: "Access denied. Missing required headers.",
      code: "MISSING_HEADERS",
    });
  }

  next();
};

// Enhanced security for login endpoints - even stricter
const loginSecurity = (req, res, next) => {
  const userAgent = req.get("User-Agent") || "";
  const referer = req.get("Referer") || "";
  const origin = req.get("Origin") || "";
  const accept = req.get("Accept") || "";
  const acceptLanguage = req.get("Accept-Language") || "";
  const acceptEncoding = req.get("Accept-Encoding") || "";
  const connection = req.get("Connection") || "";
  const cacheControl = req.get("Cache-Control") || "";
  const xRequestedWith = req.get("X-Requested-With") || "";

  // Allow NextAuth internal requests (they have X-Requested-With: XMLHttpRequest)
  const isNextAuthRequest =
    xRequestedWith === "XMLHttpRequest" &&
    (origin.includes("localhost:3000") || origin.includes("zacloth.com")) &&
    userAgent.includes("Mozilla");

  if (isNextAuthRequest) {
    console.log("✅ ALLOWED - NextAuth Internal Request:", {
      userAgent: userAgent.substring(0, 50) + "...",
      origin,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    return next();
  }

  // Block ALL external tools and scripts
  const blockedUserAgents = [
    /postman/i,
    /insomnia/i,
    /curl/i,
    /wget/i,
    /httpie/i,
    /restclient/i,
    /apideveloper/i,
    /api-tester/i,
    /thunder\s*client/i,
    /paw/i,
    /advanced\s*rest\s*client/i,
    /rest\s*assured/i,
    /newman/i,
    /swagger/i,
    /openapi/i,
    /rapidapi/i,
    /apigee/i,
    /kong/i,
    /nginx/i,
    /apache/i,
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /python/i,
    /node/i,
    /java/i,
    /php/i,
    /go-http/i,
    /okhttp/i,
    /axios/i,
    /fetch/i,
    /request/i,
    /urllib/i,
    /httpx/i,
    /aiohttp/i,
    /requests/i,
    /net\/http/i,
    /http\.client/i,
    /guzzle/i,
    /symfony/i,
    /laravel/i,
    /django/i,
    /flask/i,
    /express/i,
    /fastapi/i,
    /spring/i,
    /okio/i,
    /retrofit/i,
    /volley/i,
    /afnetworking/i,
    /alamofire/i,
  ];

  // Check if user agent is blocked
  const isBlockedUserAgent = blockedUserAgents.some((pattern) =>
    pattern.test(userAgent)
  );

  if (isBlockedUserAgent) {
    console.log("🚫 BLOCKED LOGIN ATTEMPT - External Tool:", {
      userAgent,
      ip: req.ip,
      url: req.url,
      timestamp: new Date().toISOString(),
      blocked: true,
    });

    return res.status(403).json({
      success: false,
      message:
        "Access denied. Login is only available through the web application.",
      code: "LOGIN_EXTERNAL_ACCESS_DENIED",
    });
  }

  // Require browser-specific headers
  const requiredBrowserHeaders = [
    "Accept",
    "Accept-Language",
    "Accept-Encoding",
    "Connection",
    "Cache-Control",
  ];

  const missingBrowserHeaders = requiredBrowserHeaders.filter(
    (header) => !req.get(header)
  );

  if (missingBrowserHeaders.length > 0) {
    console.log("🚫 BLOCKED LOGIN ATTEMPT - Missing Browser Headers:", {
      missingHeaders: missingBrowserHeaders,
      userAgent,
      ip: req.ip,
      url: req.url,
      timestamp: new Date().toISOString(),
    });

    return res.status(403).json({
      success: false,
      message: "Access denied. Invalid request headers.",
      code: "LOGIN_INVALID_HEADERS",
    });
  }

  // Check for browser-specific patterns in headers
  const isBrowserAccept =
    accept.includes("text/html") ||
    accept.includes("*/*") ||
    accept.includes("application/json");
  const isBrowserAcceptLanguage =
    acceptLanguage.includes("en") || acceptLanguage.includes(",");
  const isBrowserAcceptEncoding =
    acceptEncoding.includes("gzip") || acceptEncoding.includes("deflate");
  const isBrowserConnection = connection.toLowerCase().includes("keep-alive");

  if (
    !isBrowserAccept ||
    !isBrowserAcceptLanguage ||
    !isBrowserAcceptEncoding ||
    !isBrowserConnection
  ) {
    console.log("🚫 BLOCKED LOGIN ATTEMPT - Non-Browser Headers:", {
      accept,
      acceptLanguage,
      acceptEncoding,
      connection,
      userAgent,
      ip: req.ip,
      url: req.url,
      timestamp: new Date().toISOString(),
    });

    return res.status(403).json({
      success: false,
      message: "Access denied. Invalid browser headers.",
      code: "LOGIN_NON_BROWSER_HEADERS",
    });
  }

  // In production, enforce strict origin checking
  if (process.env.NODE_ENV === "production") {
    const allowedOrigins = [
      process.env.FRONTEND_URL || "https://zacloth.com",
      "https://www.zacloth.com",
    ];

    const isAllowedOrigin = allowedOrigins.some(
      (allowedOrigin) =>
        origin.includes(allowedOrigin) || referer.includes(allowedOrigin)
    );

    if (!isAllowedOrigin) {
      console.log("🚫 BLOCKED LOGIN ATTEMPT - Invalid Origin:", {
        origin,
        referer,
        userAgent,
        ip: req.ip,
        url: req.url,
        timestamp: new Date().toISOString(),
      });

      return res.status(403).json({
        success: false,
        message: "Access denied. Invalid origin.",
        code: "LOGIN_INVALID_ORIGIN",
      });
    }
  }

  // Log successful security check
  console.log("✅ LOGIN SECURITY CHECK PASSED:", {
    userAgent: userAgent.substring(0, 100) + "...",
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });

  next();
};

module.exports = {
  loginLimiter,
  apiLimiter,
  userGenerationLimiter,
  securityHeaders,
  corsOptions,
  validateRequest,
  ipWhitelist,
  requestLogger,
  webAppOnly,
  loginSecurity,
};
