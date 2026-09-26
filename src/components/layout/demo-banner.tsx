import { FlaskIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { apiClient } from "#/lib/api/client";

const KEY = "crm.demoBannerHidden.v1";

/**
 * On the public demo (DEMO_MODE on the server): says it's a demo, that you can
 * sign in as anyone, and that everything goes back to the original every day.
 * Hidden for the rest of the visit once closed.
 */
export function DemoBanner() {
	const [demo, setDemo] = useState(false);
	const [hidden, setHidden] = useState(() => {
		try {
			return sessionStorage.getItem(KEY) === "1";
		} catch {
			return false;
		}
	});
	useEffect(() => {
		apiClient
			.get<{ demo?: boolean }>("/api/health")
			.then((h) => setDemo(Boolean(h.demo)))
			.catch(() => setDemo(false));
	}, []);
	if (!demo || hidden) return null;
	return (
		<div role="note" className="flex shrink-0 items-center gap-2 border-amber-200 border-b bg-amber-50 px-4 py-1.5 text-amber-900 text-xs">
			<FlaskIcon weight="fill" className="size-4 shrink-0 text-amber-600" />
			<p className="min-w-0 flex-1">
				<b>Demo</b> · Explore freely: sign in as anyone from the menu at the bottom left. The data is fictional and goes back to the original every day at midnight
				(Brasília).
			</p>
			<button
				type="button"
				aria-label="Hide the demo notice"
				onClick={() => {
					setHidden(true);
					try {
						sessionStorage.setItem(KEY, "1");
					} catch {
						/* shown again next time */
					}
				}}
				className="rounded p-0.5 hover:bg-amber-100"
			>
				<XIcon className="size-3.5" />
			</button>
		</div>
	);
}
