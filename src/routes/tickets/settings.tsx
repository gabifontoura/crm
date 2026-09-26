import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old address of the workflow settings; they live under Settings now. */
export const Route = createFileRoute("/tickets/settings")({
	beforeLoad: () => {
		throw redirect({ to: "/settings", search: { section: "workflows" } });
	},
});
