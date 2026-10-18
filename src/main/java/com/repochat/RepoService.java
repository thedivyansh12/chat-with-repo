package com.repochat;

import com.github.javaparser.ParserConfiguration;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.TypeDeclaration;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.repochat.Model.*;
import org.eclipse.jgit.api.Git;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Service;

import java.nio.file.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.*;

/** Clone (JGit) -> parse (JavaParser) -> call graph -> embed (pgvector). */
@Service
public class RepoService {
    private static final int MAX_METHODS = 400; // keeps prototype embedding cost low
    private final VectorStore store;
    private final Map<String, Repo> repos = new ConcurrentHashMap<>();

    public RepoService(VectorStore store) {
        this.store = store;
        StaticJavaParser.getParserConfiguration().setLanguageLevel(ParserConfiguration.LanguageLevel.JAVA_17);
    }

    public Repo get(String id) {
        Repo r = repos.get(id);
        if (r == null) throw new NoSuchElementException("Unknown repo id: " + id);
        return r;
    }

    public Repo index(String url) throws Exception {
        if (!url.matches("https://github\\.com/[\\w.-]+/[\\w.-]+(\\.git)?/?"))
            throw new IllegalArgumentException("Provide a public https://github.com/owner/repo URL");
        String id = Integer.toHexString(url.hashCode());
        Path dir = Files.createTempDirectory("repo-");
        try (Git ignored = Git.cloneRepository().setURI(url).setDirectory(dir.toFile()).setDepth(1).call()) { }

        List<Method> methods = new ArrayList<>();
        try (Stream<Path> files = Files.walk(dir)) {
            for (Path p : files.filter(f -> f.toString().endsWith(".java") && !f.toString().contains(".git")).toList()) {
                try {
                    CompilationUnit cu = StaticJavaParser.parse(p);
                    String rel = dir.relativize(p).toString();
                    for (MethodDeclaration m : cu.findAll(MethodDeclaration.class)) {
                        if (m.getRange().isEmpty() || m.getBody().isEmpty()) continue;
                        String cls = m.findAncestor(TypeDeclaration.class).map(t -> t.getNameAsString()).orElse("?");
                        String code = m.toString();
                        if (code.length() > 1500) code = code.substring(0, 1500) + "\n...";
                        Set<String> calls = m.findAll(MethodCallExpr.class).stream()
                                .map(MethodCallExpr::getNameAsString).collect(Collectors.toSet());
                        methods.add(new Method(cls + "." + m.getNameAsString(), cls, m.getNameAsString(), rel,
                                m.getRange().get().begin.line, m.getRange().get().end.line, code, calls));
                    }
                } catch (Exception skip) { /* unparsable file: ignore */ }
            }
        }
        if (methods.size() > MAX_METHODS) methods = new ArrayList<>(methods.subList(0, MAX_METHODS));

        // call graph: link caller -> every repo method whose simple name is called
        Map<String, List<Method>> byName = methods.stream().collect(Collectors.groupingBy(Method::name));
        Set<Edge> edges = new LinkedHashSet<>();
        for (Method m : methods)
            for (String c : m.calls())
                for (Method t : byName.getOrDefault(c, List.of()))
                    if (!t.id().equals(m.id())) edges.add(new Edge(m.id(), t.id()));

        // embed chunks
        List<Document> docs = methods.stream().map(m -> new Document(
                "File: " + m.file() + " lines " + m.start() + "-" + m.end() + "\n" + m.id() + "\n" + m.code(),
                Map.of("repo", id, "mid", m.id()))).toList();
        for (int i = 0; i < docs.size(); i += 50) store.add(docs.subList(i, Math.min(i + 50, docs.size())));

        Repo repo = new Repo(id, url, methods, new ArrayList<>(edges));
        repos.put(id, repo);
        return repo;
    }

    public GraphDto graph(String id) {
        Repo r = get(id);
        return new GraphDto(r.methods().stream().map(m -> new Node(m.id(), m.file(), m.start(), m.end())).toList(), r.edges());
    }

    /** Impact analysis: everything that transitively calls the given method. */
    public Set<String> impact(String id, String methodId) {
        Repo r = get(id);
        Map<String, List<String>> callers = new HashMap<>();
        r.edges().forEach(e -> callers.computeIfAbsent(e.target(), k -> new ArrayList<>()).add(e.source()));
        Set<String> seen = new LinkedHashSet<>();
        Deque<String> q = new ArrayDeque<>(List.of(methodId));
        while (!q.isEmpty())
            for (String c : callers.getOrDefault(q.poll(), List.of())) if (seen.add(c)) q.add(c);
        return seen;
    }
}
