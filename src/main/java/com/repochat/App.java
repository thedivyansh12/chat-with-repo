package com.repochat;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import java.io.File;

@SpringBootApplication
public class App {
    public static void main(String[] args) {
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            System.err.println("FATAL UNCAUGHT EXCEPTION in thread " + t.getName() + ": " + e);
            e.printStackTrace(System.err);
        });

        // Set writable cache and home directory for DJL, ONNX, and JGit in container environments
        System.setProperty("user.home", "/tmp");
        System.setProperty("DJL_CACHE_DIR", "/tmp/djl-cache");
        System.setProperty("ENGINE_CACHE_DIR", "/tmp/djl-cache");
        try {
            new File("/tmp/djl-cache").mkdirs();
            new File("/tmp/onnx-cache").mkdirs();
        } catch (Exception ignored) {}

        // Auto-sanitize DB_URL for JDBC compatibility (handling Neon/Supabase/Render strings)
        String dbUrl = System.getenv("DB_URL");
        if (dbUrl != null && !dbUrl.isBlank()) {
            dbUrl = dbUrl.trim();
            if (dbUrl.startsWith("postgresql://")) {
                dbUrl = "jdbc:" + dbUrl;
            }
            // Strip channel_binding if present (unsupported by standard PostgreSQL JDBC driver)
            dbUrl = dbUrl.replace("&channel_binding=require", "")
                         .replace("?channel_binding=require&", "?")
                         .replace("?channel_binding=require", "");
            System.setProperty("DB_URL", dbUrl);
            System.setProperty("spring.datasource.url", dbUrl);
        }

        String apiKey = System.getenv("LLM_API_KEY");
        if (apiKey != null && !apiKey.isBlank()) {
            System.setProperty("LLM_API_KEY", apiKey.trim());
        }

        SpringApplication.run(App.class, args);
    }
}
