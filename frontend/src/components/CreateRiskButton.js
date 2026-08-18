import React from 'react';
import { Button } from './ui/button';
import { Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * Reusable button to spawn a new Risk/Opportunity from any module.
 * Pre-fills source, linked module, linked record id, area, title and description
 * via query-string. The RiskOpportunities page picks these up on mount.
 *
 * Usage:
 *   <CreateRiskButton
 *     source="NCR"
 *     linkedModule="NCR Register"
 *     linkedRecordId={ncr.ncr_number}
 *     area="Quality"
 *     title={`NCR ${ncr.ncr_number} — ${ncr.product_description}`}
 *     description={ncr.description}
 *   />
 */
export const CreateRiskButton = ({
  source = '', linkedModule = '', linkedRecordId = '',
  area = '', type = 'Risk', title = '', description = '',
  label = 'Create Risk / Opportunity',
  size = 'default', variant = 'outline', className = '',
  testId = 'create-ro-btn',
}) => {
  const navigate = useNavigate();
  const handleClick = () => {
    const q = new URLSearchParams();
    q.set('new', '1');
    if (source) q.set('source', source);
    if (linkedModule) q.set('linked_module', linkedModule);
    if (linkedRecordId) q.set('linked_record_id', linkedRecordId);
    if (area) q.set('area', area);
    if (type) q.set('type', type);
    if (title) q.set('title', title);
    if (description) q.set('description', description);
    navigate(`/ims/risk-opportunities?${q.toString()}`);
  };
  return (
    <Button size={size} variant={variant} onClick={handleClick} className={className} data-testid={testId}>
      <Target className="w-4 h-4 mr-1" /> {label}
    </Button>
  );
};

export default CreateRiskButton;
