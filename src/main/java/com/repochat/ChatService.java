package com.repochat;

import com.repochat.Model.*;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.*;

/** GraphRAG: vector hits + call-graph neighbours -> LLM -> validated citations. */
@Service
public class ChatService {
    private static final Pattern CITE = Pattern.compile("\\[([^\\]\\s:]+\\.java):(\\d+)-(\\d+)\\]");
    private final ChatClient chat;
    private final VectorStore store;
    private final RepoService repos;

    public ChatService(ChatClient.Builder builder, VectorStore store, RepoService repos) {
        this.chat = builder.build();
        this.store = store;
        this.repos = repos;
    }

    public Answer ask(String repoId, String question) {
        Repo repo = repos.get(repoId);
        List<Document> hits = store.similaritySearch(SearchRequest.builder()
                .query(question).topK(6).filterExpression("repo == '" + repoId + "'").build());

        Set<String> highlight = new LinkedHashSet<>();
        StringBuilder ctx = new StringBuilder();
        for (Document d : hits) {
            String mid = (String) d.getMetadata().get("mid");
            highlight.add(mid);
            ctx.append("---\n").append(d.getText()).append("\n");
            List<String> callees = repo.edges().stream().filter(e -> e.source().equals(mid)).map(Edge::target).toList();
            List<String> callers = repo.edges().stream().filter(e -> e.target().equals(mid)).map(Edge::source).toList();
            ctx.append("Calls: ").append(callees).append("\nCalled by: ").append(callers).append("\n");
            highlight.addAll(callees); highlight.addAll(callers);
        }

        String raw = chat.prompt()
                .system("""
                        You answer questions about a Java codebase using ONLY the context given.
                        Cite every claim as [path/File.java:startLine-endLine] using the line ranges in the context.
                        If the context does not contain the answer, say you could not find it.""")
                .user("Context:\n" + ctx + "\nQuestion: " + question)
                .call().content();

        return new Answer(validateCitations(repo, raw), new ArrayList<>(highlight));
    }

    /** Keep only citations that point at a real indexed file and line range. */
    private String validateCitations(Repo repo, String text) {
        Matcher m = CITE.matcher(text);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            String file = m.group(1); int s = Integer.parseInt(m.group(2)), e = Integer.parseInt(m.group(3));
            boolean ok = repo.methods().stream().anyMatch(x -> x.file().endsWith(file) && s >= x.start() && e <= x.end());
            m.appendReplacement(out, Matcher.quoteReplacement(ok ? m.group() : "[unverified citation]"));
        }
        m.appendTail(out);
        return out.toString();
    }
}
