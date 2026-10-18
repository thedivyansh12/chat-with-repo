package com.repochat;

import com.repochat.Model.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api")
public class ApiController {
    private final RepoService repos;
    private final ChatService chat;

    public ApiController(RepoService repos, ChatService chat) { this.repos = repos; this.chat = chat; }

    @PostMapping("/index")
    public Map<String, Object> index(@RequestBody Map<String, String> body) throws Exception {
        Repo r = repos.index(body.get("url"));
        return Map.of("repoId", r.id(), "methods", r.methods().size(), "edges", r.edges().size());
    }

    @GetMapping("/graph/{id}")
    public GraphDto graph(@PathVariable String id) { return repos.graph(id); }

    @GetMapping("/impact/{id}")
    public Set<String> impact(@PathVariable String id, @RequestParam String method) { return repos.impact(id, method); }

    @PostMapping("/chat")
    public Answer chat(@RequestBody Map<String, String> body) { return chat.ask(body.get("repoId"), body.get("question")); }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> err(Exception e) {
        return ResponseEntity.badRequest().body(Map.of("error", String.valueOf(e.getMessage())));
    }
}
