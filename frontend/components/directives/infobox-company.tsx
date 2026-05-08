import type { ReactNode } from 'react';
import { Building2, Calendar, MapPin, Briefcase, Users, Globe, Package } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Infobox,
  InfoboxBody,
  InfoboxHeader,
  InfoboxRow,
  extractFieldsFromChildren,
} from './infobox-shell';

interface Props {
  fields?: Record<string, string>;
  children?: ReactNode;
}

export function InfoboxCompany({ fields, children }: Props) {
  const parsed = fields ?? extractFieldsFromChildren(children);
  const name = parsed.name ?? 'Company';
  const tagline = parsed.industry ?? parsed.sector ?? parsed.type ?? null;

  return (
    <Infobox>
      <InfoboxHeader
        eyebrow="Company"
        title={name}
        description={tagline}
        avatar={
          <Avatar size="lg" className="ring-2 ring-infobox-border/60">
            <AvatarFallback className="bg-infobox-border/30 text-infobox-foreground">
              <Building2 className="size-5 opacity-80" aria-hidden />
            </AvatarFallback>
          </Avatar>
        }
      />
      <InfoboxBody>
        {Object.entries(parsed)
          .filter(([k]) => k !== 'name')
          .map(([k, v]) => (
            <InfoboxRow key={k} label={k} icon={iconForKey(k)}>
              {v}
            </InfoboxRow>
          ))}
      </InfoboxBody>
    </Infobox>
  );
}

function iconForKey(key: string): LucideIcon | undefined {
  const k = key.toLowerCase();
  if (/(found|established|since|date)/.test(k)) return Calendar;
  if (/(headquarter|hq|location|address|city|country)/.test(k)) return MapPin;
  if (/(industry|sector|type)/.test(k)) return Briefcase;
  if (/(employee|staff|people|team)/.test(k)) return Users;
  if (/(website|url|site|homepage)/.test(k)) return Globe;
  if (/(product|service)/.test(k)) return Package;
  return undefined;
}

