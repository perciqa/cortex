"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Container,
  Paper,
  Title,
  Text,
  PasswordInput,
  Button,
  Stack,
  Alert,
} from "@mantine/core";
import { IconLock, IconAlertCircle } from "@tabler/icons-react";

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/cortex";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push(callbackUrl);
    } else {
      const data = await res.json();
      setError(data.error ?? "Invalid password");
      setLoading(false);
    }
  }

  return (
    <Container size={420} my={80}>
      <Paper radius="md" p="xl" withBorder>
        <form onSubmit={handleSubmit}>
          <Stack align="center" gap="lg">
            <Title order={2}>Perciqa Console</Title>
            <Text c="dimmed" size="sm" ta="center">
              Enter the console password to access Argus and Cortex.
            </Text>

            {error && (
              <Alert icon={<IconAlertCircle size={16} />} color="red" w="100%">
                {error}
              </Alert>
            )}

            <PasswordInput
              w="100%"
              placeholder="Console password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              leftSection={<IconLock size={16} />}
              autoFocus
            />

            <Button fullWidth type="submit" loading={loading}>
              Enter Console
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
