import { Stack } from "expo-router";
import type { JSX } from "react";
import GitReviewScreen from "src/screens/GitReviewScreen";

export default function GitReviewRoute(): JSX.Element {
  return (
    <>
      <Stack.Screen
        options={{
          title: "Code Review",
          headerBackTitle: "",
        }}
      />
      <GitReviewScreen />
    </>
  );
}
