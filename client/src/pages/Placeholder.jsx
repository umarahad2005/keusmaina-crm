// Placeholder page for routes not yet built
export default function Placeholder({ title }) {
    return (
        <div className="flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 rounded-full bg-navy-50 flex items-center justify-center mb-4">
                <span className="text-3xl">🚧</span>
            </div>
            <h2 className="text-xl font-heading font-bold text-dark mb-2">{title}</h2>
            <p className="text-gray-500 text-sm">This module is coming soon</p>
        </div>
    );
}
