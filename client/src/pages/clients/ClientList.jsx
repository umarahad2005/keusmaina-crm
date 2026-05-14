import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import StatusBadge from '../../components/StatusBadge';
import DocumentManager from '../../components/DocumentManager';
import toast from 'react-hot-toast';
import { MdAccountCircle } from 'react-icons/md';

const PILGRIM_DOC_CATEGORIES = [
    ['passport', 'Passport scan'],
    ['cnic', 'CNIC'],
    ['photo', 'Photo'],
    ['mahram_cnic', 'Mahram CNIC'],
    ['other', 'Other']
];

const emptyB2C = { fullName: '', gender: 'Male', cnic: '', passportNumber: '', passportExpiry: '', dob: '', phone: '', whatsapp: '', address: '', city: '', mahramDetails: { name: '', relation: '', cnic: '' }, emergencyContact: { name: '', phone: '', relation: '' }, notes: '' };
const emptyB2B = { companyName: '', contactPerson: '', phone: '', whatsapp: '', email: '', city: '', address: '', commissionType: 'percentage', commissionValue: 0, notes: '' };

export default function ClientList() {
    const nav = useNavigate();
    const [tab, setTab] = useState('b2c');
    const [b2cData, setB2cData] = useState([]);
    const [b2bData, setB2bData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [b2cForm, setB2cForm] = useState(emptyB2C);
    const [b2bForm, setB2bForm] = useState(emptyB2B);
    const [editId, setEditId] = useState(null);
    const [saving, setSaving] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [b2c, b2b] = await Promise.all([api.get('/clients/b2c'), api.get('/clients/b2b')]);
            setB2cData(b2c.data.data);
            setB2bData(b2b.data.data);
        } catch { toast.error('Failed to load clients'); }
        finally { setLoading(false); }
    };
    useEffect(() => { fetchData(); }, []);

    const b2cColumns = [
        { key: 'fullName', label: 'Full Name' },
        { key: 'gender', label: 'Gender', render: v => <span className={`badge ${v === 'Male' ? 'badge-navy' : 'badge-gold'}`}>{v}</span> },
        { key: 'cnic', label: 'CNIC' },
        { key: 'passportNumber', label: 'Passport' },
        { key: 'phone', label: 'Phone' },
        { key: 'city', label: 'City' },
        { key: 'isActive', label: 'Status', render: v => <StatusBadge active={v} /> },
    ];

    const b2bColumns = [
        { key: 'agentCode', label: 'Agent Code', render: v => <span className="font-mono font-bold text-navy-800">{v}</span> },
        { key: 'companyName', label: 'Company' },
        { key: 'contactPerson', label: 'Contact Person' },
        { key: 'phone', label: 'Phone' },
        { key: 'city', label: 'City' },
        { key: 'commissionType', label: 'Commission', render: (v, row) => v === 'percentage' ? `${row.commissionValue}%` : `SAR ${row.commissionValue}` },
        { key: 'subPilgrims', label: 'Pilgrims', render: v => v?.length || 0 },
        { key: 'isActive', label: 'Status', render: v => <StatusBadge active={v} /> },
    ];

    const handleAdd = () => {
        if (tab === 'b2c') setB2cForm(emptyB2C);
        else setB2bForm(emptyB2B);
        setEditId(null);
        setModal(true);
    };

    const handleEdit = (row) => {
        if (tab === 'b2c') setB2cForm({ ...emptyB2C, ...row, mahramDetails: { ...emptyB2C.mahramDetails, ...row.mahramDetails }, emergencyContact: { ...emptyB2C.emergencyContact, ...row.emergencyContact } });
        else setB2bForm({ ...emptyB2B, ...row });
        setEditId(row._id);
        setModal(true);
    };

    const handleDelete = async (row) => {
        const label = tab === 'b2c' ? row.fullName : row.companyName;
        if (!confirm(`Deactivate "${label}"?`)) return;
        try {
            await api.delete(`/clients/${tab}/${row._id}`);
            toast.success('Deactivated');
            fetchData();
        } catch { toast.error('Failed'); }
    };

    const handleSubmit = async () => {
        const isB2C = tab === 'b2c';
        const formData = isB2C ? b2cForm : b2bForm;
        const endpoint = `/clients/${tab}`;

        if (isB2C && !formData.fullName) { toast.error('Full name required'); return; }
        if (!isB2C && !formData.companyName) { toast.error('Company name required'); return; }

        setSaving(true);
        try {
            if (editId) {
                await api.put(`${endpoint}/${editId}`, formData);
                toast.success('Updated');
            } else {
                await api.post(endpoint, formData);
                toast.success('Created');
            }
            setModal(false);
            fetchData();
        } catch (err) { toast.error(err.response?.data?.message || 'Error'); }
        finally { setSaving(false); }
    };

    const setB2C = (key, val) => setB2cForm(f => ({ ...f, [key]: val }));
    const setB2B = (key, val) => setB2bForm(f => ({ ...f, [key]: val }));
    const setMahram = (key, val) => setB2cForm(f => ({ ...f, mahramDetails: { ...f.mahramDetails, [key]: val } }));
    const setEmergency = (key, val) => setB2cForm(f => ({ ...f, emergencyContact: { ...f.emergencyContact, [key]: val } }));

    return (
        <div>
            {/* Tabs */}
            <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit">
                <button onClick={() => setTab('b2c')} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'b2c' ? 'bg-white text-navy-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    👤 B2C Pilgrims
                </button>
                <button onClick={() => setTab('b2b')} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'b2b' ? 'bg-white text-navy-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    🏢 B2B Agents
                </button>
            </div>

            {/* Table */}
            {tab === 'b2c' ? (
                <DataTable
                    columns={b2cColumns}
                    data={b2cData}
                    loading={loading}
                    onAdd={handleAdd}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    extraActions={[
                        { icon: MdAccountCircle, title: 'View profile (packages, ledger, documents)', className: 'text-navy-700 hover:bg-navy-50', onClick: (row) => nav(`/clients/view/B2C/${row._id}`) }
                    ]}
                    title="B2C Pilgrims" addLabel="Add Pilgrim" />
            ) : (
                <DataTable
                    columns={b2bColumns}
                    data={b2bData}
                    loading={loading}
                    onAdd={handleAdd}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    extraActions={[
                        { icon: MdAccountCircle, title: 'View profile (packages, ledger, sub-pilgrims)', className: 'text-navy-700 hover:bg-navy-50', onClick: (row) => nav(`/clients/view/B2B/${row._id}`) }
                    ]}
                    title="B2B Agents" addLabel="Add Agent" />
            )}

            {/* B2C Modal */}
            {tab === 'b2c' && (
                <FormModal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Edit Pilgrim' : 'Add Pilgrim (B2C)'} onSubmit={handleSubmit} loading={saving}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div><label className="label">Full Name *</label>
                            <input className="input" value={b2cForm.fullName} onChange={e => setB2C('fullName', e.target.value)} /></div>
                        <div><label className="label">Gender *</label>
                            <select className="select" value={b2cForm.gender} onChange={e => setB2C('gender', e.target.value)}>
                                <option>Male</option><option>Female</option>
                            </select></div>
                        <div><label className="label">CNIC</label>
                            <input className="input" value={b2cForm.cnic} onChange={e => setB2C('cnic', e.target.value)} placeholder="12345-1234567-1" /></div>
                        <div><label className="label">Phone *</label>
                            <input className="input" value={b2cForm.phone} onChange={e => setB2C('phone', e.target.value)} placeholder="+92..." /></div>
                        <div><label className="label">Passport Number</label>
                            <input className="input" value={b2cForm.passportNumber} onChange={e => setB2C('passportNumber', e.target.value)} /></div>
                        <div><label className="label">Passport Expiry</label>
                            <input className="input" type="date" value={b2cForm.passportExpiry?.slice(0, 10) || ''} onChange={e => setB2C('passportExpiry', e.target.value)} /></div>
                        <div><label className="label">Date of Birth</label>
                            <input className="input" type="date" value={b2cForm.dob?.slice(0, 10) || ''} onChange={e => setB2C('dob', e.target.value)} /></div>
                        <div><label className="label">City</label>
                            <input className="input" value={b2cForm.city} onChange={e => setB2C('city', e.target.value)} /></div>
                    </div>

                    {/* Mahram Section — only for Female */}
                    {b2cForm.gender === 'Female' && (
                        <div className="mt-4 p-4 bg-pink-50 rounded-xl border border-pink-200">
                            <h4 className="text-sm font-bold text-pink-800 mb-3">👳 Mahram Details (Required for Female)</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div><label className="label text-xs">Mahram Name *</label>
                                    <input className="input text-sm" value={b2cForm.mahramDetails.name} onChange={e => setMahram('name', e.target.value)} /></div>
                                <div><label className="label text-xs">Relation *</label>
                                    <input className="input text-sm" value={b2cForm.mahramDetails.relation} onChange={e => setMahram('relation', e.target.value)} placeholder="Father/Husband/Brother" /></div>
                                <div><label className="label text-xs">Mahram CNIC</label>
                                    <input className="input text-sm" value={b2cForm.mahramDetails.cnic} onChange={e => setMahram('cnic', e.target.value)} /></div>
                            </div>
                        </div>
                    )}

                    {/* Emergency Contact */}
                    <div className="mt-4">
                        <h4 className="text-sm font-bold text-gray-600 mb-2">🆘 Emergency Contact</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <input className="input text-sm" value={b2cForm.emergencyContact.name} onChange={e => setEmergency('name', e.target.value)} placeholder="Name" />
                            <input className="input text-sm" value={b2cForm.emergencyContact.phone} onChange={e => setEmergency('phone', e.target.value)} placeholder="Phone" />
                            <input className="input text-sm" value={b2cForm.emergencyContact.relation} onChange={e => setEmergency('relation', e.target.value)} placeholder="Relation" />
                        </div>
                    </div>
                    {/* Documents — only available when editing an existing client */}
                    {editId && (
                        <div className="mt-4 p-3 bg-navy-50/50 rounded-xl border border-navy-100">
                            <h4 className="text-sm font-bold text-navy-800 mb-2">📎 Documents</h4>
                            <DocumentManager
                                documents={b2cForm.documents || []}
                                uploadUrl={`/clients/b2c/${editId}/documents`}
                                onChange={(updated) => setB2cForm(f => ({ ...f, documents: updated.documents || [] }))}
                                categories={PILGRIM_DOC_CATEGORIES}
                            />
                        </div>
                    )}

                    <div className="mt-3"><label className="label">Notes</label>
                        <textarea className="input" rows={2} value={b2cForm.notes} onChange={e => setB2C('notes', e.target.value)} /></div>
                </FormModal>
            )}

            {/* B2B Modal */}
            {tab === 'b2b' && (
                <FormModal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Edit Agent' : 'Add Agent (B2B)'} onSubmit={handleSubmit} loading={saving}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div><label className="label">Company Name *</label>
                            <input className="input" value={b2bForm.companyName} onChange={e => setB2B('companyName', e.target.value)} /></div>
                        <div><label className="label">Contact Person *</label>
                            <input className="input" value={b2bForm.contactPerson} onChange={e => setB2B('contactPerson', e.target.value)} /></div>
                        <div><label className="label">Phone *</label>
                            <input className="input" value={b2bForm.phone} onChange={e => setB2B('phone', e.target.value)} /></div>
                        <div><label className="label">WhatsApp</label>
                            <input className="input" value={b2bForm.whatsapp} onChange={e => setB2B('whatsapp', e.target.value)} /></div>
                        <div><label className="label">Email</label>
                            <input className="input" type="email" value={b2bForm.email} onChange={e => setB2B('email', e.target.value)} /></div>
                        <div><label className="label">City</label>
                            <input className="input" value={b2bForm.city} onChange={e => setB2B('city', e.target.value)} /></div>
                        <div><label className="label">Commission Type</label>
                            <select className="select" value={b2bForm.commissionType} onChange={e => setB2B('commissionType', e.target.value)}>
                                <option value="percentage">Percentage (%)</option>
                                <option value="fixed">Fixed (SAR)</option>
                            </select></div>
                        <div><label className="label">Commission Value</label>
                            <input className="input" type="number" value={b2bForm.commissionValue} onChange={e => setB2B('commissionValue', e.target.value)} /></div>
                    </div>
                    <div className="mt-3"><label className="label">Notes</label>
                        <textarea className="input" rows={2} value={b2bForm.notes} onChange={e => setB2B('notes', e.target.value)} /></div>
                </FormModal>
            )}
        </div>
    );
}
