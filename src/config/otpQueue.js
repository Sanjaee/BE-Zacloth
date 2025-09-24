require("dotenv").config();
const { Queue, Worker } = require("bullmq");
const { PrismaClient } = require("@prisma/client");
const { sendVerificationEmail } = require("../utils/emailOtp");

const prisma = new PrismaClient();

// Redis connection configuration (reuse from payment queue)
const getRedisConnection = () => {
  const host = process.env.REDIS_HOST || "localhost";
  const port = process.env.REDIS_PORT || 6379;
  const password = process.env.REDIS_PASSWORD;
  const db = process.env.REDIS_DB || 0;

  return {
    host,
    port,
    password: password && password.trim() !== "" ? password : undefined,
    db: parseInt(db),
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
  };
};

// OTP Queue configuration
class OtpQueue {
  constructor() {
    this.connection = getRedisConnection();
    this.queue = null;
    this.worker = null;
    this.initializeQueue();
  }

  initializeQueue() {
    // Create OTP queue
    this.queue = new Queue("otp-processing", {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: 100, // Keep more completed jobs for monitoring
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        // Set job timeout to 30 seconds
        jobTimeout: 30000,
      },
    });

    // Create worker to process OTP jobs
    this.worker = new Worker("otp-processing", this.processOtpJob.bind(this), {
      connection: this.connection,
      concurrency: 5, // Process up to 5 OTP jobs concurrently
      limiter: {
        max: 10, // Max 10 jobs per minute
        duration: 60000,
      },
    });

    // Add event listeners
    this.queue.on("error", (error) => {
      console.error("OTP queue error:", error);
    });

    this.worker.on("error", (error) => {
      console.error("OTP worker error:", error);
    });

    this.worker.on("ready", () => {
      console.log("OTP worker is ready");
    });

    this.worker.on("completed", (job) => {
      console.log(`OTP job ${job.id} completed successfully`);
    });

    this.worker.on("failed", (job, err) => {
      console.error(`OTP job ${job.id} failed:`, err.message);
    });

    this.worker.on("stalled", (jobId) => {
      console.warn(`OTP job ${jobId} stalled`);
    });

    console.log("OTP queue and worker initialized");
  }

  // Process OTP job
  async processOtpJob(job) {
    const { type, data } = job.data;

    console.log(`Processing OTP job: ${type}`, { jobId: job.id });

    try {
      switch (type) {
        case "send-registration-otp":
          return await this.processRegistrationOtp(job, data);
        case "resend-otp":
          return await this.processResendOtp(job, data);
        case "send-password-reset-otp":
          return await this.processPasswordResetOtp(job, data);
        case "resend-password-reset-otp":
          return await this.processResendPasswordResetOtp(job, data);
        default:
          throw new Error(`Unknown OTP job type: ${type}`);
      }
    } catch (error) {
      console.error(`OTP job ${job.id} failed:`, error);
      throw error;
    }
  }

  // Process registration OTP
  async processRegistrationOtp(job, data) {
    const { userId, email, username, otp } = data;

    await job.updateProgress(10);

    // Validate required data
    if (!userId || !email || !username || !otp) {
      throw new Error("Missing required data for registration OTP");
    }

    await job.updateProgress(30);

    // Send verification email
    try {
      await sendVerificationEmail(email, username, otp);
      console.log(`Registration OTP sent successfully to ${email}`);
    } catch (emailError) {
      console.error("Failed to send registration OTP email:", emailError);
      throw new Error(`Failed to send OTP email: ${emailError.message}`);
    }

    await job.updateProgress(100);

    return {
      success: true,
      message: "Registration OTP sent successfully",
      data: {
        userId,
        email,
        username,
        otpSent: true,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Process resend OTP
  async processResendOtp(job, data) {
    const { userId, email, username, otp } = data;

    await job.updateProgress(10);

    // Validate required data
    if (!userId || !email || !username || !otp) {
      throw new Error("Missing required data for resend OTP");
    }

    await job.updateProgress(30);

    // Send verification email
    try {
      await sendVerificationEmail(email, username, otp);
      console.log(`Resend OTP sent successfully to ${email}`);
    } catch (emailError) {
      console.error("Failed to send resend OTP email:", emailError);
      throw new Error(`Failed to send OTP email: ${emailError.message}`);
    }

    await job.updateProgress(100);

    return {
      success: true,
      message: "Resend OTP sent successfully",
      data: {
        userId,
        email,
        username,
        otpSent: true,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Process password reset OTP
  async processPasswordResetOtp(job, data) {
    const { userId, email, username, otp } = data;

    await job.updateProgress(10);

    // Validate required data
    if (!userId || !email || !username || !otp) {
      throw new Error("Missing required data for password reset OTP");
    }

    await job.updateProgress(30);

    // Send verification email (reuse the same email template)
    try {
      await sendVerificationEmail(email, username, otp);
      console.log(`Password reset OTP sent successfully to ${email}`);
    } catch (emailError) {
      console.error("Failed to send password reset OTP email:", emailError);
      throw new Error(`Failed to send OTP email: ${emailError.message}`);
    }

    await job.updateProgress(100);

    return {
      success: true,
      message: "Password reset OTP sent successfully",
      data: {
        userId,
        email,
        username,
        otpSent: true,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Process resend password reset OTP
  async processResendPasswordResetOtp(job, data) {
    const { userId, email, username, otp } = data;

    await job.updateProgress(10);

    // Validate required data
    if (!userId || !email || !username || !otp) {
      throw new Error("Missing required data for resend password reset OTP");
    }

    await job.updateProgress(30);

    // Send verification email (reuse the same email template)
    try {
      await sendVerificationEmail(email, username, otp);
      console.log(`Resend password reset OTP sent successfully to ${email}`);
    } catch (emailError) {
      console.error(
        "Failed to send resend password reset OTP email:",
        emailError
      );
      throw new Error(`Failed to send OTP email: ${emailError.message}`);
    }

    await job.updateProgress(100);

    return {
      success: true,
      message: "Resend password reset OTP sent successfully",
      data: {
        userId,
        email,
        username,
        otpSent: true,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Add OTP job to queue
  async addOtpJob(type, data, options = {}) {
    if (!this.queue) {
      throw new Error("OTP queue not initialized");
    }

    const job = await this.queue.add(
      type,
      { type, data },
      {
        priority: options.priority || 0,
        delay: options.delay || 0,
        // Add job metadata for tracking
        jobId:
          options.jobId ||
          `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...options,
      }
    );

    console.log(`Added OTP job: ${type}`, { jobId: job.id });
    return job;
  }

  // Get job status
  async getJobStatus(jobId) {
    if (!this.queue) {
      throw new Error("OTP queue not initialized");
    }

    const job = await this.queue.getJob(jobId);
    if (!job) {
      return null;
    }

    return {
      id: job.id,
      name: job.name,
      data: job.data,
      progress: job.progress,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      timestamp: job.timestamp,
      attemptsMade: job.attemptsMade,
      opts: job.opts,
      state: await job.getState(),
    };
  }

  // Get queue statistics
  async getQueueStats() {
    if (!this.queue) {
      throw new Error("OTP queue not initialized");
    }

    const waiting = await this.queue.getWaiting();
    const active = await this.queue.getActive();
    const completed = await this.queue.getCompleted();
    const failed = await this.queue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length,
    };
  }

  // Clean old jobs (optional maintenance)
  async cleanOldJobs() {
    if (!this.queue) {
      throw new Error("OTP queue not initialized");
    }

    try {
      // Clean completed jobs older than 1 hour
      await this.queue.clean(3600000, 100, "completed");
      // Clean failed jobs older than 24 hours
      await this.queue.clean(86400000, 50, "failed");
      console.log("OTP queue cleaned successfully");
    } catch (error) {
      console.error("Failed to clean OTP queue:", error);
    }
  }

  // Close queue and worker
  async close() {
    if (this.worker) {
      await this.worker.close();
    }
    if (this.queue) {
      await this.queue.close();
    }
  }
}

// Create singleton instance
const otpQueue = new OtpQueue();

module.exports = otpQueue;
