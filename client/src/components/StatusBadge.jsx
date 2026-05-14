export default function StatusBadge({ active }) {
    return (
        <span className={active ? 'badge-active' : 'badge-inactive'}>
            {active ? 'Active' : 'Inactive'}
        </span>
    );
}
