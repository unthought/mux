import { Ionicons } from "@expo/vector-icons";
import type { JSX } from "react";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useTheme } from "../theme";
import { Surface } from "./Surface";
import { ThemedText } from "./ThemedText";
import { TodoItemView, type TodoItem } from "./TodoItemView";

interface TodoToolCardProps {
  todos: TodoItem[];
  status: "pending" | "executing" | "completed" | "failed" | "interrupted";
}

/**
 * Historical todo tool call display (appears in chat as tool call message).
 * Shows past todo_write calls with all tasks.
 */
export function TodoToolCard({ todos, status }: TodoToolCardProps): JSX.Element {
  const theme = useTheme();
  const spacing = theme.spacing;
  const [isExpanded, setIsExpanded] = useState(false);

  const statusConfig = (() => {
    switch (status) {
      case "completed":
        return { color: theme.colors.success, label: "✓ Completed" };
      case "failed":
        return { color: theme.colors.danger, label: "✗ Failed" };
      case "interrupted":
        return { color: theme.colors.warning, label: "⚠ Interrupted" };
      case "executing":
        return { color: theme.colors.accent, label: "⟳ Executing" };
      default:
        return { color: theme.colors.foregroundSecondary, label: "○ Pending" };
    }
  })();

  const completedCount = todos.filter((t) => t.status === "completed").length;

  return (
    <Surface variant="plain" style={{ padding: spacing.md, marginBottom: spacing.md }} accessibilityRole="summary">
      <Pressable
        onPress={() => setIsExpanded(!isExpanded)}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Ionicons
            name={isExpanded ? "chevron-down" : "chevron-forward"}
            size={16}
            color={theme.colors.foregroundSecondary}
          />
          <Text style={{ fontSize: 16 }}>📋</Text>
          <ThemedText variant="label" style={{ flex: 1 }}>
            todo_write ({completedCount}/{todos.length})
          </ThemedText>
          <ThemedText variant="caption" style={{ color: statusConfig.color }}>
            {statusConfig.label}
          </ThemedText>
        </View>
      </Pressable>

      {isExpanded && (
        <View style={{ marginTop: spacing.md }}>
          {todos.map((todo, index) => (
            <TodoItemView key={index} todo={todo} />
          ))}
        </View>
      )}
    </Surface>
  );
}
