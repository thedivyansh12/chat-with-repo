package com.repochat;

import java.util.*;

public class Model {
    public record Method(String id, String cls, String name, String file, int start, int end, String code, Set<String> calls) {}
    public record Edge(String source, String target) {}
    public record Node(String id, String file, int start, int end) {}
    public record GraphDto(List<Node> nodes, List<Edge> links) {}
    public record Repo(String id, String url, List<Method> methods, List<Edge> edges) {}
    public record Answer(String answer, List<String> highlight) {}
}
