// Sample graph in the exact shape of GET /graph/meta from the FastAPI backend.
// Used as the demo dataset until a real repo is wired in.

export type GraphNode = {
  id: string;
  type: "file" | "function" | "class";
  file: string;
  name: string;
  color?: string;
  textColor?: string;
  loc?: number;
  last_commit?: string | null;
  churn_score?: number;
};

export type GraphEdge = {
  source: string;
  target: string;
  type: "imports" | "calls" | "include";
  color?: string;
};

export type GraphPayload = { nodes: GraphNode[]; edges: GraphEdge[] };

const f = (file: string, fns: string[] = [], classes: string[] = [], churn = 0, loc = 0): GraphNode[] => [
  { id: file, type: "file", file, name: file, churn_score: churn, loc, last_commit: "2025-04-12" },
  ...classes.map((c) => ({ id: `${file}::${c}`, type: "class" as const, file, name: c })),
  ...fns.map((fn) => ({ id: `${file}::${fn}`, type: "function" as const, file, name: fn })),
];

export const SAMPLE_GRAPH: GraphPayload = {
  nodes: [
    ...f("src/server.py", ["main", "_print_banner"], [], 8, 70),
    ...f("src/parser.py", ["parse_repo", "resolve_repo", "_parse_py", "_parse_c", "_make_node", "_make_edge"], ["_PyVisitor"], 24, 391),
    ...f("src/meta.py", ["enrich_nodes", "_git_meta", "_loc"], [], 6, 115),
    ...f("src/ui.py", ["index", "view", "favicon"], [], 3, 60),
    ...f("src/colors.py", [], [], 1, 25),
    ...f("src/api/graph.py", ["get_graph", "get_graph_meta"], [], 4, 40),
    ...f("src/api/impact.py", ["get_impact", "_traverse"], [], 5, 80),
    ...f("src/utils/git.py", ["clone_repo", "list_commits"], [], 2, 50),
    ...f("src/utils/io.py", ["read_text", "safe_write"], [], 1, 30),
    ...f("tests/test_parser.py", ["test_parse_py", "test_parse_c"], [], 1, 45),
    ...f("tests/test_meta.py", ["test_enrich"], [], 0, 30),
  ],
  edges: [
    // imports
    { source: "src/server.py", target: "src/parser.py", type: "imports" },
    { source: "src/server.py", target: "src/meta.py", type: "imports" },
    { source: "src/server.py", target: "src/ui.py", type: "imports" },
    { source: "src/parser.py", target: "src/colors.py", type: "imports" },
    { source: "src/meta.py", target: "src/parser.py", type: "imports" },
    { source: "src/api/graph.py", target: "src/parser.py", type: "imports" },
    { source: "src/api/graph.py", target: "src/meta.py", type: "imports" },
    { source: "src/api/impact.py", target: "src/parser.py", type: "imports" },
    { source: "src/utils/git.py", target: "src/utils/io.py", type: "imports" },
    { source: "src/parser.py", target: "src/utils/git.py", type: "imports" },
    { source: "tests/test_parser.py", target: "src/parser.py", type: "imports" },
    { source: "tests/test_meta.py", target: "src/meta.py", type: "imports" },
    // calls
    { source: "src/parser.py::parse_repo", target: "src/parser.py::_parse_py", type: "calls" },
    { source: "src/parser.py::parse_repo", target: "src/parser.py::_parse_c", type: "calls" },
    { source: "src/parser.py::parse_repo", target: "src/parser.py::_make_node", type: "calls" },
    { source: "src/parser.py::_parse_py", target: "src/parser.py::_make_node", type: "calls" },
    { source: "src/parser.py::_parse_py", target: "src/parser.py::_make_edge", type: "calls" },
    { source: "src/parser.py::_parse_c", target: "src/parser.py::_make_node", type: "calls" },
    { source: "src/meta.py::enrich_nodes", target: "src/meta.py::_git_meta", type: "calls" },
    { source: "src/meta.py::enrich_nodes", target: "src/meta.py::_loc", type: "calls" },
    { source: "src/api/graph.py::get_graph_meta", target: "src/parser.py::parse_repo", type: "calls" },
    { source: "src/api/graph.py::get_graph_meta", target: "src/meta.py::enrich_nodes", type: "calls" },
    { source: "src/api/graph.py::get_graph", target: "src/parser.py::parse_repo", type: "calls" },
    { source: "src/api/impact.py::get_impact", target: "src/api/impact.py::_traverse", type: "calls" },
    { source: "src/server.py::main", target: "src/server.py::_print_banner", type: "calls" },
    { source: "src/utils/git.py::clone_repo", target: "src/utils/io.py::read_text", type: "calls" },
    { source: "tests/test_parser.py::test_parse_py", target: "src/parser.py::parse_repo", type: "calls" },
    { source: "tests/test_parser.py::test_parse_c", target: "src/parser.py::parse_repo", type: "calls" },
    { source: "tests/test_meta.py::test_enrich", target: "src/meta.py::enrich_nodes", type: "calls" },
  ],
};
