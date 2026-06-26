import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, RefreshCw, Wrench } from 'lucide-react';

const Undermaintence = () => {
	const currentYear = new Date().getFullYear();

	return (
		<div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-blue-50 px-6 py-10 md:px-10">
			<div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
				<div className="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.35)]">
					<div className="grid gap-0 lg:grid-cols-2">
						<div className="relative flex flex-col justify-between border-b border-slate-100 bg-slate-900 p-8 text-white lg:border-b-0 lg:border-r lg:border-slate-800 md:p-10">
							<div>
								<div className="inline-flex items-center gap-2 rounded-full border border-blue-300/30 bg-blue-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-200">
									<Wrench className="h-3.5 w-3.5" />
									Scheduled Update
								</div>

								<h1 className="mt-6 text-3xl font-bold leading-tight md:text-4xl">
									We’re improving SaliDock
								</h1>
								<p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300 md:text-base">
									The platform is temporarily unavailable while we deploy performance and stability upgrades.
									We’ll be back online shortly.
								</p>
							</div>

							<div className="mt-8 rounded-2xl border border-slate-700/70 bg-slate-800/70 p-4 text-sm text-slate-200">
								<div className="flex items-start gap-3">
									<AlertTriangle className="mt-0.5 h-4 w-4 text-amber-300" />
									<p>
										If this persists, please contact support with your timestamp and browser details.
									</p>
								</div>
							</div>
						</div>

						<div className="p-8 md:p-10">
							<h2 className="text-2xl font-semibold text-slate-900">Under Maintenance</h2>
							<p className="mt-3 text-sm leading-relaxed text-slate-600 md:text-base">
								We’re currently rolling out infrastructure upgrades. Thank you for your patience while we make the platform faster and more reliable.
							</p>

							<div className="mt-8 space-y-3">
								<button
									type="button"
									onClick={() => window.location.reload()}
									className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
								>
									<RefreshCw className="h-4 w-4" />
									Check Again
								</button>

								<Link
									to="/"
									className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
								>
									<ArrowLeft className="h-4 w-4" />
									Back to Home
								</Link>
							</div>

							<div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50 p-4">
								<p className="text-xs font-medium uppercase tracking-wider text-blue-700">Status</p>
								<p className="mt-1 text-sm text-slate-700">
									Maintenance in progress. Estimated availability: <span className="font-semibold text-slate-900">shortly</span>.
								</p>
							</div>

							<p className="mt-8 text-xs text-slate-500">© {currentYear} SaliDock. All rights reserved.</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default Undermaintence;
