"use client";
import { Tooltip } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";

export function PageInfo({ description }: { description: string }) {
  return (
    <Tooltip label={description} position="right" withArrow multiline maw={280}>
      <IconInfoCircle
        size={18}
        style={{ cursor: "pointer", color: "var(--dark-grey)", flexShrink: 0 }}
      />
    </Tooltip>
  );
}
