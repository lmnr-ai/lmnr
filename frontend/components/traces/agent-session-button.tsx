import { Disc, Pause } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useProjectContext } from '@/contexts/project-context';
import { Button } from '../ui/button';

interface AgentSessionButtonProps {
    traceId: string;
}

export function AgentSessionButton({ traceId }: AgentSessionButtonProps) {
    const [isActive, setIsActive] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { projectId } = useProjectContext();

    useEffect(() => {
        const checkSessionStatus = async () => {
            try {
                const response = await fetch(`/api/projects/${projectId}/agent-session`);
                if (response.ok) {
                    const data = await response.json();
                    setIsActive(data.isActive);
                }
            } catch (error) {
                console.error('Error checking agent session status:', error);
            }
        };

        checkSessionStatus();
        // Poll for updates every 5 seconds
        const intervalId = setInterval(checkSessionStatus, 5000);
        return () => clearInterval(intervalId);
    }, [projectId, traceId]);

    const handleCancelAgentRun = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/agent-session`, {
                method: 'DELETE',
            });

            if (response.ok) {
                setIsActive(false);
            }
        } catch (error) {
            console.error('Error canceling agent run:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Button
            variant="secondary"
            onClick={handleCancelAgentRun}
            disabled={isLoading}
        >
            <Pause size={16} className="mr-2" />
            Cancel agent run
        </Button>
    );
} 