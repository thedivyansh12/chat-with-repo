package com.repochat;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class App {
    public static void main(String[] args) {
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
