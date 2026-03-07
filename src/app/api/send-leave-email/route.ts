import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';

const emailSchema = z.object({
    applicantName: z.string().min(1),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    reason: z.string().min(1),
    departmentId: z.string().optional().nullable(),
});

export async function POST(request: Request) {
    // 1. Authenticate user to make sure this is a valid request
    const cookieStore = await cookies()
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll() }
            }
        }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        
        // Validate input
        const result = emailSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json({ error: 'Validation failed', details: result.error.flatten() }, { status: 400 });
        }

        const { applicantName, startDate, endDate, reason, departmentId } = result.data;

        // Fetch all managers and admins who belong to this department (or global if null)
        let query = supabase
            .from('users')
            .select('email, role, is_primary_leave_approver')
            .in('role', ['ADMIN', 'MANAGER', 'SUPER_ADMIN'])
            .eq('status', 'ACTIVE');
            
        if (departmentId) {
            query = query.eq('department_id', departmentId);
        }

        const { data: admins, error: fetchError } = await query;

        if (fetchError || !admins || admins.length === 0) {
            console.error('Failed to fetch admins for email', fetchError);
            // Non-fatal, just means no one gets the email
            return NextResponse.json({ success: false, message: 'No admins found to send email to' }, { status: 200 });
        }

        // Identify primary approver and CC list
        let primaryEmail = process.env.NODEMAILER_USER_EMAIL || ''; 
        let ccEmails: string[] = [];

        // Check if there's any user designated as primary
        const primaryApprovers = admins.filter(admin => admin.is_primary_leave_approver);
        
        if (primaryApprovers.length > 0) {
            primaryEmail = primaryApprovers[0].email;
            ccEmails = admins.filter(admin => admin.email !== primaryEmail).map(a => a.email);
        } else {
            // Fallback: everyone is just thrown into the to: or we pick the first one
            primaryEmail = admins[0].email;
            ccEmails = admins.slice(1).map(a => a.email);
        }

        // Setup Nodemailer transport
        // Expects environment variables for SMTP details
        if (!process.env.NODEMAILER_USER_EMAIL || !process.env.NODEMAILER_APP_PASSWORD) {
            console.warn('Nodemailer configuration missing in .env.local');
            return NextResponse.json({ error: 'Email configuration missing on server' }, { status: 500 });
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail', // You can change this if using another provider
            auth: {
                user: process.env.NODEMAILER_USER_EMAIL,
                pass: process.env.NODEMAILER_APP_PASSWORD,
            },
        });

        // Email Html Template
        const htmlContent = `
            <h2>New Leave Request: ${applicantName}</h2>
            <p><strong>Applicant:</strong> ${applicantName}</p>
            <p><strong>From:</strong> ${startDate}</p>
            <p><strong>To:</strong> ${endDate}</p>
            <p><strong>Reason:</strong></p>
            <blockquote style="border-left: 4px solid #ccc; padding-left: 10px; color: #555;">
                ${reason}
            </blockquote>
            <p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/leaves" style="background: #2563eb; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; display: inline-block;">View in Dashboard</a></p>
        `;

        const mailOptions = {
            from: `"Production Team App" <${process.env.NODEMAILER_USER_EMAIL}>`,
            to: primaryEmail,
            cc: ccEmails.length > 0 ? ccEmails.join(', ') : undefined,
            subject: `Leave Request: ${applicantName}`,
            html: htmlContent,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Leave email sent:', info.messageId);

        return NextResponse.json({ success: true, messageId: info.messageId });

    } catch (error: any) {
        console.error('Failed to send leave email:', error);
        return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }
}
