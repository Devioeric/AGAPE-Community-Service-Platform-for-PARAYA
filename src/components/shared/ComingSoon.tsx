import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface ComingSoonProps {
  title: string;
  description?: string;
}

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="border-border shadow-card max-w-md w-full text-center">
        <CardContent className="pt-10 pb-10 px-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/15 mb-5">
            <Construction className="w-8 h-8 text-accent" />
          </div>
          <h2 className="font-heading text-2xl font-bold text-foreground mb-2">
            {title}
          </h2>
          <p className="text-muted-foreground text-sm">
            {description ??
              "This module is under development and will be available in the next sprint."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
