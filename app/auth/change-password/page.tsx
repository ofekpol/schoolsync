import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";

export default function ChangePasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 border rounded-lg shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">עדכון סיסמה</h1>
          <p className="text-sm text-muted-foreground">
            בחרו סיסמה חדשה כדי להמשיך.
          </p>
        </div>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
