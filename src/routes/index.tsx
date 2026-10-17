import { createFileRoute } from "@tanstack/react-router";
import { LinebellApp } from "@/components/linebell-app";

export const Route = createFileRoute("/")({ component: LinebellApp });
