declare module "*.css";

declare module "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare module "https://esm.sh/@supabase/supabase-js@2.57.4" {
	export * from "@supabase/supabase-js";
}

declare const Deno: {
	env: {
		get: (key: string) => string | undefined;
	};
	serve: (
		handler: (request: Request) => Response | Promise<Response>
	) => void;
};
